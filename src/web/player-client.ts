import { appUrl } from './deployment.ts';
import type { PlayerHistory, PlayerProfile, PlayerSession, PlayerLeaderboard } from './player-types.ts';

/** Credentials stay in cookies; this client keeps only display state and the current match ticket. */
export class PlayerClient {
  session: PlayerSession | null = null;
  private listeners = new Set<() => void>();
  private matchTicket: Promise<string | null> | null = null;
  private pending: Promise<PlayerSession> | null = null;
  private fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = (...args) => fetch(...args)) { this.fetcher = fetcher; }
  subscribe(listener: () => void): void { this.listeners.add(listener); }
  private changed(): void { for (const listener of this.listeners) listener(); }
  updatePoints(points: number): void {
    if (this.session) { this.session.player.points = points; this.changed(); }
  }
  async refresh(): Promise<PlayerSession> {
    if (this.pending) return this.pending;
    this.pending = this.request<PlayerSession>('/api/player/me').then(session => {
      this.session = session; this.changed(); return session;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  async rename(nickname: string): Promise<void> {
    const player = await this.request<PlayerProfile>('/api/player/profile', 'PATCH', { nickname });
    if (this.session) { this.session.player = player; this.changed(); }
  }
  history(cursor?: string): Promise<PlayerHistory> {
    return this.request(`/api/player/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
  }
  leaderboard(): Promise<PlayerLeaderboard> { return this.request('/api/player/leaderboard'); }
  async claim(guestId: string): Promise<number> {
    const { count } = await this.request<{ count: number }>('/api/player/claim', 'POST', { guestId });
    await this.refresh(); return count;
  }
  async login(): Promise<string> {
    const { url } = await this.request<{ url: string }>('/api/player/login', 'POST', {}); return url;
  }
  async logout(): Promise<void> {
    await this.request('/api/player/logout', 'POST', {}); await this.refresh();
  }
  beginGame(mode: 'duel' | 'identity', seed: number): void {
    // Establish ownership before play. An auth outage never blocks the single-player engine.
    this.matchTicket = (async () => {
      const session = await this.refresh();
      if (session.auth === 'unavailable') return null;
      const reply = await this.request<{ ticket: string }>('/api/player/games', 'POST', { mode, seed });
      return reply.ticket;
    })().catch(() => null);
  }
  async saveHeaders(): Promise<Record<string, string>> {
    if (!this.matchTicket) return {};
    const ticket = await this.matchTicket;
    if (!ticket) throw new Error('开局时未能绑定玩家，本局可下载保存；恢复后下一局会自动同步');
    return { 'X-Sanguoce-Match': ticket };
  }
  private async request<T>(path: string, method = 'GET', body?: object): Promise<T> {
    const reply = await this.fetcher(appUrl(path), { method, credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(path !== '/api/player/me' && this.session ? { 'X-Sanguoce-Player': this.session.player.id } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const payload = await reply.json().catch(() => null);
    if (!reply.ok) throw new Error(payload?.error || '账号服务暂时不可用');
    if (payload === null) throw new Error('账号服务暂时不可用，仍可直接游玩');
    return payload as T;
  }
}
export const playerClient = new PlayerClient();

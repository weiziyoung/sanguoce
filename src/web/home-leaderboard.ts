import { playerClient, type PlayerClient } from './player-client.ts';
import type { LeaderboardEntry } from './player-types.ts';

/** Public board loads independently; errors never disable starting a game. */
export class HomeLeaderboard {
  private panel = document.getElementById('home-leaderboard')!;
  private toggleButton = document.getElementById('leaderboard-toggle') as HTMLButtonElement;
  private list = document.getElementById('leaderboard-list')!;
  private status = document.getElementById('leaderboard-status')!;
  private refreshButton = document.getElementById('leaderboard-refresh') as HTMLButtonElement;
  private modes = document.getElementById('mode-select')!;
  private busy = false;
  private client: PlayerClient;
  private entries: LeaderboardEntry[] = [];
  private playerKey = '';
  constructor(client: PlayerClient = playerClient) {
    this.client = client;
    this.setOpen(false);
    this.toggleButton.onclick = () => this.setOpen(this.panel.classList.contains('hidden'));
    this.refreshButton.onclick = () => { void this.refresh(); };
    document.addEventListener('pointerdown', event => {
      if (event.target instanceof Node && !this.panel.contains(event.target) && !this.toggleButton.contains(event.target)) this.setOpen(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !this.panel.classList.contains('hidden') && !this.modes.classList.contains('hidden')) {
        event.preventDefault(); this.setOpen(false); this.toggleButton.focus();
      }
    });
    client.subscribe(() => {
      this.render();
      const player = client.session?.player;
      const key = player ? `${player.id}:${player.points}:${player.nickname}` : '';
      if (key !== this.playerKey) {
        this.playerKey = key;
        if (!this.modes.classList.contains('hidden')) void this.refresh();
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.modes.classList.contains('hidden')) void this.refresh();
    });
  }
  private setOpen(open: boolean): void {
    this.panel.classList.toggle('hidden', !open);
    this.toggleButton.setAttribute('aria-expanded', String(open));
    if (open) void this.refresh();
  }
  async refresh(): Promise<void> {
    if (this.busy || this.panel.classList.contains('hidden')) return;
    this.busy = true; this.refreshButton.disabled = true;
    this.status.textContent = this.entries.length ? '正在更新…' : '正在读取积分榜…';
    try {
      this.entries = (await this.client.leaderboard()).entries;
      this.render();
      this.status.textContent = this.entries.length ? '按累计积分排序 · 游客也可上榜' : '还没有积分记录，完成一局来上榜吧。';
    } catch {
      this.status.textContent = this.entries.length ? '更新失败，保留上次结果；可点击刷新。' : '积分榜暂时无法读取，可点击刷新；仍可直接开局。';
    } finally { this.busy = false; this.refreshButton.disabled = false; }
  }
  private render(): void {
    this.list.replaceChildren(...this.entries.map(entry => {
      const row = document.createElement('li'); row.className = 'leaderboard-row'; row.dataset.rank = String(entry.rank);
      row.classList.toggle('is-self', entry.id === this.client.session?.player.id);
      const rank = document.createElement('span'); rank.className = 'leaderboard-rank'; rank.textContent = String(entry.rank);
      const name = document.createElement('span'); name.className = 'leaderboard-name'; name.textContent = entry.nickname; name.title = entry.nickname;
      if (entry.id === this.client.session?.player.id) name.append(document.createTextNode(' · 你'));
      const points = document.createElement('strong'); points.className = 'leaderboard-points'; points.textContent = `${entry.points} 分`;
      row.append(rank, name, points); return row;
    }));
  }
}

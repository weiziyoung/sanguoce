import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { PlayerStore, tokenHash } from './player-store.ts';
import type { PersonalGame, PlayerProfile, PlayerSession } from './player-types.ts';
import { saveWebGame } from './web-game-upload.ts';
import { coinReward, isShopItem } from './shop.ts';
import { matchReward } from './match-reward.ts';

const GUEST_COOKIE = 'sanguoce_guest';
interface Identity {
  session: PlayerSession;
  guest: PlayerProfile | null;
}
export interface PlayerServiceOptions {
  traceDirectory: string;
  origin?: string;
  /** Public browser prefix, before the reverse proxy strips it. */
  basePath?: string;
  authApiUrl?: string;
  authFetcher?: typeof fetch;
}
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export class PlayerService {
  readonly store: PlayerStore;
  private basePath: string;
  private options: PlayerServiceOptions;
  constructor(options: PlayerServiceOptions) {
    this.options = options;
    const path = options.basePath ?? '/';
    if (!/^\/[\w/-]*$/.test(path) || path.includes('//')) throw new Error('Invalid player cookie path');
    this.basePath = path === '/' ? '/' : path.replace(/\/+$/, '');
    this.store = new PlayerStore(join(options.traceDirectory, 'players.sqlite'));
  }
  close(): void { this.store.close(); }

  async handle(request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> {
    if (!pathname.startsWith('/api/player/') && pathname !== '/api/web-games') return false;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Vary', 'Cookie');
    try {
      // Preserve trace-only uploads from CLI/tools; account-bound writes require a browser Origin.
      if (pathname === '/api/web-games' && !request.headers['x-sanguoce-match']) {
        if (request.headers.origin && request.headers.origin !== this.origin(request)) throw new HttpError(403, '请求来源不符');
        await saveWebGame(request, response, this.options.traceDirectory);
        return true;
      }
      if (request.method !== 'GET') this.checkOrigin(request);
      if (pathname === '/api/player/leaderboard') {
        this.requireMethod(request, 'GET'); this.json(response, this.store.leaderboard()); return true;
      }
      if (pathname === '/api/player/login') {
        this.requireMethod(request, 'POST');
        await this.login(request, response); return true;
      }
      if (pathname === '/api/player/logout') {
        this.requireMethod(request, 'POST');
        await this.logout(request, response); return true;
      }
      const identity = await this.identity(request, response);
      if (pathname === '/api/player/me') {
        this.requireMethod(request, 'GET'); this.json(response, identity.session); return true;
      }
      if (identity.session.auth === 'unavailable') throw new HttpError(503, '博客登录暂时无法验证，稍后重试；单机仍可继续');
      const player = identity.session.player;
      if (pathname === '/api/player/history') {
        this.requireMethod(request, 'GET');
        this.checkPlayer(request, player);
        const cursor = new URL(request.url ?? '/', 'http://localhost').searchParams.get('cursor');
        this.json(response, this.store.history(player.id, cursor));
      } else if (pathname === '/api/player/shop' || pathname === '/api/player/items/use') {
        this.requireMethod(request, 'POST'); this.checkPlayer(request, player);
        const { item, orderId, ticket } = await this.body(request);
        if (!isShopItem(item)) throw new HttpError(400, '无效的商品');
        if (pathname === '/api/player/shop' && (typeof orderId !== 'string' || !/^[\w-]{16,100}$/.test(orderId)))
          throw new HttpError(400, '无效的购买编号');
        if (pathname.endsWith('/use') && typeof ticket !== 'string') throw new HttpError(400, '缺少本局道具凭据');
        try {
          this.json(response, pathname.endsWith('/use') ? this.store.useItem(player.id, ticket as string, item)
            : this.store.purchase(player.id, item, orderId as string));
        } catch (error) { throw new HttpError(409, error instanceof Error ? error.message : '道具操作失败'); }
      } else if (pathname === '/api/player/profile') {
        this.requireMethod(request, 'PATCH'); this.checkPlayer(request, player);
        const { nickname } = await this.body(request);
        this.checkPlayer(request, player);
        if (typeof nickname !== 'string' || !nickname.trim() || [...nickname.trim()].length > 24 || /[\p{Cc}\p{Cf}]/u.test(nickname))
          throw new HttpError(400, '昵称需要 1～24 个字，不能包含控制字符');
        this.json(response, this.store.rename(player.id, nickname.trim()));
      } else if (pathname === '/api/player/claim') {
        this.requireMethod(request, 'POST'); this.checkPlayer(request, player);
        const { guestId } = await this.body(request);
        if (identity.session.auth !== 'signed-in') throw new HttpError(401, '请先登录');
        if (!identity.guest || guestId !== identity.guest.id) throw new HttpError(409, '游客记录已认领或浏览器身份已改变');
        const count = this.store.claim(identity.guest.id, player.id);
        this.cookie(response, '', 0);
        this.json(response, { count });
      } else if (pathname === '/api/player/games') {
        this.requireMethod(request, 'POST'); this.checkPlayer(request, player);
        const { mode, seed } = await this.body(request);
        this.checkPlayer(request, player);
        if (!['duel', 'identity'].includes(String(mode)) || typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
          throw new HttpError(400, '无效的对局配置');
        this.json(response, { ticket: this.store.start(player.id, mode as 'duel' | 'identity', seed) }, 201);
      } else if (pathname === '/api/web-games') {
        this.requireMethod(request, 'POST');
        const token = request.headers['x-sanguoce-match'];
        const match = typeof token === 'string' ? this.store.match(token) : null;
        if (!match || match.expires_at < Date.now()) throw new HttpError(401, '本局保存凭据失效');
        if (this.store.canonical(match.player_id) !== player.id) throw new HttpError(409, '本局属于另一玩家，请恢复开局时的登录身份');
        await saveWebGame(request, response, this.options.traceDirectory, game => {
          const mode = game.config.mode === 'identity' ? 'identity' : 'duel';
          const human = game.players.find(p => p.id === game.humanSeat);
          if (!human || game.config.seed !== match.seed || mode !== match.mode ||
            (game.outcome.status !== 'finished' && game.outcome.status !== 'draw') ||
            (game.outcome.status === 'finished' && !Array.isArray(game.outcome.winners)) ||
            !Number.isInteger(game.turn) || game.turn < 0 || game.turn > 1000000 ||
            typeof game.finishedAt !== 'string' || !Number.isFinite(Date.parse(game.finishedAt))) throw new Error('无效的对局记录');
          const hash = tokenHash(JSON.stringify(game));
          if (match.document_hash && match.document_hash !== hash) throw new Error('已保存的对局不能覆盖');
          const reward = matchReward(game);
          const gold = coinReward(game);
          const summary: PersonalGame = { id: match.id, finishedAt: new Date(game.finishedAt).toISOString(),
            mode, general: typeof human.general === 'string' ? human.general.slice(0, 120) : '',
            result: game.outcome.status === 'draw' ? 'draw' : game.outcome.winners.includes(game.humanSeat) ? 'win' : 'loss',
            turn: game.turn, source: 'browser', earnedPoints: reward.total, reward, earnedCoins: gold.total, coinReward: gold };
          return { id: match.id, commit: () => this.store.finish(match.id, hash, summary),
            receipt: () => this.store.receipt(match.id, player.id) };
        });
      } else throw new HttpError(404, '接口不存在');
    } catch (error) {
      if (!response.headersSent) this.json(response, { error: error instanceof HttpError ? error.message : '账号操作失败，请稍后重试' }, error instanceof HttpError ? error.status : 500);
      else response.end();
    }
    return true;
  }

  private async identity(request: IncomingMessage, response: ServerResponse): Promise<Identity> {
    const cookie = request.headers.cookie ?? '';
    let guest = this.store.guest(this.guestToken(request));
    let auth: PlayerSession['auth'] = 'guest';
    let member: PlayerProfile | null = null;
    const hasBlogCookie = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=/.test(cookie);
    if (this.options.authApiUrl && hasBlogCookie) {
      try {
        const reply = await this.authFetch('/auth/session', { headers: { cookie } });
        if (!reply.ok) throw new Error('会话查询失败');
        const payload = await reply.json();
        const user = payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
        if (user !== null && user !== undefined) {
          if (typeof user.id !== 'string' || !user.id || user.id.length > 200) throw new Error('无效的会话');
          member = this.store.member({ id: user.id, name: typeof user.name === 'string' ? user.name : typeof user.handle === 'string' ? user.handle : undefined,
            image: typeof user.image === 'string' ? user.image : undefined });
          auth = 'signed-in';
        }
      } catch { auth = 'unavailable'; }
    }
    if (!member && !guest) {
      const issued = this.store.issueGuest(); guest = issued.player;
      this.cookie(response, issued.token, 365 * 86400);
    }
    return { guest, session: { player: member ?? guest!, auth, loginAvailable: Boolean(this.options.authApiUrl),
      claimableGames: member && guest ? this.store.count(guest.id) : 0,
      claimableGuestId: member && guest ? guest.id : null } };
  }
  private origin(request: IncomingMessage): string {
    return this.options.origin ?? `http://${request.headers.host}`;
  }
  private guestToken(request: IncomingMessage): string | undefined {
    return request.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length + 1);
  }
  private checkOrigin(request: IncomingMessage): void {
    if (request.headers.origin !== this.origin(request) || request.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, '请求来源不符');
  }
  private checkPlayer(request: IncomingMessage, player: PlayerProfile): void {
    if (request.headers['x-sanguoce-player'] !== player.id || this.store.canonical(player.id) !== player.id)
      throw new HttpError(409, '登录身份已改变，请刷新账号信息后重试');
  }
  private requireMethod(request: IncomingMessage, method: string): void {
    if (request.method !== method) throw new HttpError(405, '请求方法不支持');
  }
  private cookie(response: ServerResponse, token: string, age: number): void {
    const cookies = response.getHeader('Set-Cookie');
    const prior = typeof cookies === 'string' ? [cookies] : Array.isArray(cookies) ? cookies.map(String) : [];
    response.setHeader('Set-Cookie', [...prior, `${GUEST_COOKIE}=${token}; Path=${this.basePath}; Max-Age=${age}; HttpOnly; SameSite=Lax${this.options.origin?.startsWith('https:') ? '; Secure' : ''}`]);
  }
  private async body(request: IncomingMessage): Promise<Record<string, unknown>> {
    if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '需要 JSON 请求');
    let size = 0; const chunks: Buffer[] = [];
    for await (const chunk of request) {
      size += chunk.length; if (size > 4096) throw new HttpError(413, '请求过大'); chunks.push(chunk);
    }
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error();
      return data;
    } catch { throw new HttpError(400, '无效的请求'); }
  }
  private json(response: ServerResponse, value: unknown, status = 200): void {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(value));
  }
  private async authFetch(path: string, init: RequestInit): Promise<Response> {
    if (!this.options.authApiUrl) throw new HttpError(503, '此环境尚未连接博客登录，可直接以游客游玩');
    return (this.options.authFetcher ?? fetch)(`${this.options.authApiUrl.replace(/\/+$/, '')}${path}`, {
      ...init, signal: AbortSignal.timeout(4000), redirect: 'error',
    });
  }
  private copyCookies(reply: Response, response: ServerResponse): void {
    const cookies = reply.headers.getSetCookie();
    if (cookies.length) response.setHeader('Set-Cookie', cookies);
  }
  private async login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const callbackURL = `${this.origin(request)}${this.basePath === '/' ? '/' : this.basePath + '/'}?account=login`;
    const reply = await this.authFetch('/auth/sign-in/social', { method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: this.origin(request), cookie: request.headers.cookie ?? '' },
      body: JSON.stringify({ provider: 'github', callbackURL, disableRedirect: true }) });
    if (!reply.ok) throw new HttpError(502, 'GitHub 登录暂时不可用');
    const payload = await reply.json();
    const url = payload?.url ?? payload?.data?.url;
    if (typeof url !== 'string' || new URL(url).origin !== 'https://github.com') throw new HttpError(502, '无效的登录地址');
    this.copyCookies(reply, response); this.json(response, { url });
  }
  private async logout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const reply = await this.authFetch('/auth/sign-out', { method: 'POST',
      headers: { origin: this.origin(request), cookie: request.headers.cookie ?? '' } });
    if (!reply.ok) throw new HttpError(502, '退出登录失败，请重试');
    this.copyCookies(reply, response);
    // Keep unrelated, unclaimed local history accessible after signing out.
    if (!this.store.guest(this.guestToken(request))) {
      const guest = this.store.issueGuest(); this.cookie(response, guest.token, 365 * 86400);
    }
    this.json(response, { ok: true });
  }
}

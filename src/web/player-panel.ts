import { allContent } from '../app/game-content.ts';
import { playerClient, type PlayerClient } from './player-client.ts';
import type { GameSettings } from './settings.ts';
import type { PersonalGame } from './player-types.ts';
import { rewardDescription } from './match-reward.ts';

const CLAIM_INTENT = 'sanguoce.claim-intent.v1';

/** Native dialog pauses gameplay through the same mechanism as settings. */
export class PlayerPanel {
  private dialog = document.getElementById('player-dialog') as HTMLDialogElement;
  private status = document.getElementById('player-status')!;
  private nickname = document.getElementById('player-nickname') as HTMLInputElement;
  private cursor: string | null = null;
  private busy = false;
  private historyGeneration = 0;
  private historyOwner: string | null = null;
  private inGame = false;
  private settings: GameSettings;
  private client: PlayerClient;
  constructor(settings: GameSettings, client: PlayerClient = playerClient) {
    this.settings = settings; this.client = client;
    for (const id of ['player-home', 'player-game', 'player-settlement']) document.getElementById(id)!.onclick = () => this.show();
    document.getElementById('player-close')!.onclick = () => this.dialog.close();
    this.dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.dialog.close(); }
    });
    this.dialog.addEventListener('close', () => {
      this.historyGeneration++;
      settings.setOpen(false);
    });
    document.getElementById('player-profile-form')!.onsubmit = event => {
      event.preventDefault(); const nickname = this.nickname.value; void this.action(async () => {
        await client.rename(nickname); this.status.textContent = '昵称已保存';
      });
    };
    document.getElementById('player-login')!.onclick = () => { void this.action(async () => {
      const guestId = client.session?.player.kind === 'guest' ? client.session.player.id : null;
      const claim = (document.getElementById('player-login-claim') as HTMLInputElement).checked;
      try {
        sessionStorage.removeItem(CLAIM_INTENT);
        if (claim && guestId) sessionStorage.setItem(CLAIM_INTENT, JSON.stringify({ guestId, expires: Date.now() + 15 * 60_000 }));
      } catch { /* Manual claim remains available when browser storage is disabled. */ }
      const url = await client.login(); window.location.assign(url);
    }); };
    document.getElementById('player-logout')!.onclick = () => { void this.action(async () => {
      await client.logout(); await this.history(); this.status.textContent = '已退出网站账号，当前以游客身份游玩';
    }); };
    document.getElementById('player-claim')!.onclick = () => { void this.action(async () => {
      const guestId = client.session?.claimableGuestId;
      if (!guestId) return;
      const count = await client.claim(guestId); await this.history();
      this.status.textContent = `已将 ${count} 局游客战绩保存到当前账号`;
    }); };
    document.getElementById('player-refresh')!.onclick = () => { void this.action(async () => {
      await client.refresh(); await this.history(); this.status.textContent = '';
    }); };
    document.getElementById('player-more')!.onclick = () => { void this.action(() => this.history(true)); };
    client.subscribe(() => this.render());
    void this.initialize();
  }
  setInGame(): void { this.inGame = true; }
  private async initialize(): Promise<void> {
    try {
      const session = await this.client.refresh();
      let intent: { guestId: string; expires: number } | null = null;
      try {
        const saved = sessionStorage.getItem(CLAIM_INTENT);
        if (saved) intent = JSON.parse(saved);
        // Only consume a login intent once auth resolves; an outage keeps it available for retry.
        if (session.auth !== 'unavailable') sessionStorage.removeItem(CLAIM_INTENT);
      } catch { /* The account is still usable without sessionStorage. */ }
      if (session.auth === 'signed-in' && intent && intent.expires > Date.now() && intent.guestId === session.claimableGuestId) {
        const count = await this.client.claim(intent.guestId);
        this.status.textContent = `已保存 ${count} 局游客战绩`;
      }
      const url = new URL(location.href);
      if (url.searchParams.get('account') === 'login') {
        url.searchParams.delete('account'); history.replaceState(null, '', url);
        this.show();
      }
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : '账号服务暂时不可用，仍可直接游玩';
      this.render();
    }
  }
  private render(): void {
    const session = this.client.session;
    document.getElementById('player-points')!.textContent = session?.auth === 'unavailable' ? '—' : String(session?.player.points ?? 0);
    document.getElementById('player-coins')!.textContent = String(session?.player.wallet?.coins ?? 0);
    const member = session?.auth === 'signed-in';
    const owner = session?.auth !== 'unavailable' ? session?.player.id ?? null : null;
    if (owner !== this.historyOwner) {
      this.historyOwner = owner; this.historyGeneration++; this.cursor = null;
      document.getElementById('player-history')!.replaceChildren();
      document.getElementById('player-totals')!.textContent = owner ? '正在读取战绩…' : '战绩暂时无法读取';
      (document.getElementById('player-more') as HTMLButtonElement).hidden = true;
    }
    for (const id of ['player-home', 'player-game', 'player-settlement']) {
      const button = document.getElementById(id)!;
      button.textContent = id === 'player-home' && session ? session.player.nickname : '玩家';
      button.title = session ? `${session.player.nickname} · ${member ? '网站账号' : '游客'} · 我的战绩` : '玩家与战绩';
    }
    document.getElementById('player-kind')!.textContent = member ? '网站账号 · 已同步身份' : '游客 · 无需注册';
    document.getElementById('player-description')!.textContent = session?.auth === 'unavailable'
      ? '博客登录暂时无法验证，单机仍可继续；账号操作恢复后再试。'
      : member ? '复用博客账号，战绩随账号跨设备保存。'
        : '同一浏览器会保留游客身份；清除 Cookie 或换设备后无法恢复。登录后可跨设备保存战绩。';
    if (session) {
      this.nickname.value = session.player.nickname;
      document.getElementById('player-id')!.textContent = `玩家编号 ${session.player.id}`;
    }
    const avatar = document.getElementById('player-avatar') as HTMLImageElement;
    avatar.hidden = !session?.player.avatar;
    if (session?.player.avatar) avatar.src = session.player.avatar;
    document.getElementById('player-login-area')!.classList.toggle('hidden', Boolean(member));
    document.getElementById('player-logout')!.classList.toggle('hidden', !member);
    const claim = document.getElementById('player-claim')!;
    claim.classList.toggle('hidden', !member || !session?.claimableGuestId);
    claim.textContent = `将本浏览器游客战绩（${session?.claimableGames ?? 0} 局）保存到我的账号`;
    document.getElementById('player-login-note')!.textContent = !session?.loginAvailable
      ? '此环境未连接博客登录，可以直接以游客游玩。'
      : this.inGame ? '登录需要跳转；当前未结束的对局不会保留。退出网站账号也会同步退出博客。'
        : '使用现有 GitHub 登录，无需填写个人资料。退出网站账号也会同步退出博客。';
    for (const id of ['player-save-name', 'player-login', 'player-logout', 'player-claim']) {
      (document.getElementById(id) as HTMLButtonElement).disabled = this.busy || !session ||
        session.auth === 'unavailable' || (id === 'player-login' && !session.loginAvailable);
    }
  }
  private show(): void {
    if (this.dialog.open) return;
    this.dialog.showModal(); this.settings.setOpen(true); this.render();
    void this.action(async () => { await this.client.refresh(); await this.history(); });
  }
  private async action(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.render();
    try { await work(); }
    catch (error) { this.status.textContent = error instanceof Error ? error.message : '账号操作失败'; }
    finally { this.busy = false; this.render(); }
  }
  private async history(more = false): Promise<void> {
    const generation = ++this.historyGeneration;
    const owner = this.client.session?.player.id;
    const result = await this.client.history(more ? this.cursor ?? undefined : undefined);
    if (generation !== this.historyGeneration || owner !== this.client.session?.player.id) return;
    this.cursor = result.nextCursor;
    this.client.updatePoints(result.points);
    document.getElementById('player-totals')!.textContent = `${result.total} 局 · ${result.wins} 胜 · ${result.losses} 负 · ${result.draws} 平`;
    const list = document.getElementById('player-history')!;
    if (!more) list.replaceChildren();
    if (!result.total) {
      const empty = document.createElement('li'); empty.textContent = '还没有已完成的对局，去玩一局吧。'; list.append(empty);
    }
    for (const game of result.games) list.append(this.gameRow(game));
    (document.getElementById('player-more') as HTMLButtonElement).hidden = !this.cursor;
  }
  private gameRow(game: PersonalGame): HTMLElement {
    const row = document.createElement('li'); row.className = 'player-history-row';
    const result = document.createElement('strong');
    result.textContent = { win: '胜', loss: '负', draw: '平' }[game.result]; result.dataset.result = game.result;
    const detail = document.createElement('span');
    let general = game.general || '未记录武将';
    try { general = allContent.general(game.general).label; } catch { /* Unknown historical content keeps its saved name. */ }
    detail.textContent = `${game.mode === 'identity' ? '五人身份' : '对决'} · ${general} · ${game.turn} 回合`;
    const date = document.createElement('small'); date.textContent = new Date(game.finishedAt).toLocaleString('zh-CN');
    const points = document.createElement('span'); points.className = 'player-history-points';
    points.textContent = game.reward ? `积分 +${game.earnedPoints}` : '积分规则启用前的记录';
    if (game.reward) points.title = rewardDescription(game.reward);
    const coins = document.createElement('span'); coins.className = 'player-history-points';
    coins.textContent = `金币 +${game.earnedCoins ?? 0}`;
    row.append(result, detail, points, coins, date); return row;
  }
}

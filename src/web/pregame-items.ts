import { NAMES, cardAssetKey } from '../../catalog.ts';
import type { BrowserSession } from '../app/browser-session.ts';
import type { OpeningOptions } from '../app/browser-opening.ts';
import type { AssetManifest } from './assets.ts';
import { playerClient } from './player-client.ts';

/** All item decisions happen before turn and game-start skills are resolved. */
export class PregameItems {
  private pointDialog = document.getElementById('point-dialog') as HTMLDialogElement;
  private handDialog = document.getElementById('opening-dialog') as HTMLDialogElement;
  private busy = false;
  private selected = '';
  private options: OpeningOptions = {};
  constructor(private session: BrowserSession, private manifest: AssetManifest,
    private start: (generalId: string, options: OpeningOptions) => void) {
    document.getElementById('selection-tools')!.classList.remove('hidden');
    document.getElementById('point-general')!.onclick = () => {
      if (this.busy || this.handDialog.open) return;
      this.pointDialog.showModal(); this.renderGenerals();
    };
    document.getElementById('point-close')!.onclick = () => { if (!this.busy) this.pointDialog.close(); };
    document.getElementById('point-search')!.oninput = () => this.renderGenerals();
    playerClient.subscribe(() => {
      if (this.handDialog.open) this.updateRedraw();
      if (this.pointDialog.open && !this.busy) this.renderGenerals();
    });
    this.pointDialog.addEventListener('keydown', event => event.stopPropagation());
    this.pointDialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    this.handDialog.addEventListener('keydown', event => event.stopPropagation());
    this.handDialog.addEventListener('cancel', event => event.preventDefault());
    document.getElementById('opening-redraw')!.onclick = () => { void this.redraw(); };
    document.getElementById('opening-start')!.onclick = () => {
      if (this.busy) return;
      this.busy = true;
      this.handDialog.close(); document.getElementById('selection-tools')!.classList.add('hidden');
      this.start(this.selected, this.options);
    };
  }
  open(generalId: string): void {
    if (this.busy || this.handDialog.open || this.pointDialog.open) return;
    this.selected = generalId; this.options = {};
    this.showHand();
  }
  private renderGenerals(): void {
    const search = (document.getElementById('point-search') as HTMLInputElement).value.trim().toLowerCase();
    const list = document.getElementById('point-generals')!;
    const count = playerClient.session?.player.wallet?.items.general ?? 0;
    document.getElementById('point-status')!.textContent = `点将卡 ${count} 张 · 出战时消耗一张 · 仅显示本局已启用武将`;
    list.replaceChildren();
    for (const general of this.session.pointCandidates ?? []) {
      if (search && !`${general.label} ${general.id} ${general.skills.join(' ')}`.toLowerCase().includes(search)) continue;
      const button = document.createElement('button'); button.className = 'point-candidate';
      if (this.manifest.generals[general.id]) {
        const image = document.createElement('img'); image.src = this.manifest.generals[general.id]; image.alt = ''; image.loading = 'lazy'; button.append(image);
      }
      const name = document.createElement('strong'); name.textContent = general.label;
      const skills = document.createElement('small'); skills.textContent = `${general.hp} 体力 · ${general.skills.join(' / ')}`;
      button.append(name, skills); button.disabled = this.busy || !count || playerClient.session?.auth === 'unavailable';
      button.onclick = () => { void this.point(general.id); }; list.append(button);
    }
    if (!list.children.length) list.textContent = '没有匹配的武将';
  }
  private async point(generalId: string): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.renderGenerals();
    try {
      await playerClient.useItem('general');
      this.selected = generalId; this.options = { pointGeneral: true };
      this.pointDialog.close(); this.showHand();
    } catch (error) { document.getElementById('point-status')!.textContent = error instanceof Error ? error.message : '使用失败，请重试'; }
    finally {
      this.busy = false; this.updateRedraw();
      for (const button of this.pointDialog.querySelectorAll<HTMLButtonElement>('.point-candidate'))
        button.disabled = !(playerClient.session?.player.wallet?.items.general ?? 0) || playerClient.session?.auth === 'unavailable';
    }
  }
  private showHand(): void {
    document.getElementById('opening-status')!.textContent = '确认起手牌后开战；重抽会消耗一张重抽卡。';
    this.renderHand(); this.handDialog.showModal(); this.updateRedraw();
  }
  private renderHand(): void {
    const list = document.getElementById('opening-cards')!; list.replaceChildren();
    for (const card of this.session.openingHand?.(this.selected, this.options) ?? []) {
      const item = document.createElement('div'); item.className = 'opening-card';
      const label = `${({ spade: '♠', heart: '♥', club: '♣', diamond: '♦' })[card.suit]}${card.rank} ${card.label ?? NAMES[card.name]}`;
      if (this.manifest.cards[cardAssetKey(card)]) {
        const image = document.createElement('img'); image.src = this.manifest.cards[cardAssetKey(card)]; image.alt = label; item.append(image);
      }
      const caption = document.createElement('span'); caption.textContent = label; item.append(caption); list.append(item);
    }
  }
  private updateRedraw(): void {
    const count = playerClient.session?.player.wallet?.items.redraw ?? 0;
    const button = document.getElementById('opening-redraw') as HTMLButtonElement;
    button.textContent = this.options.redraw ? '本局已重抽' : `使用重抽卡 · 剩余 ${count} 张`;
    button.disabled = this.busy || !!this.options.redraw || !count || playerClient.session?.auth === 'unavailable';
    (document.getElementById('opening-start') as HTMLButtonElement).disabled = this.busy;
  }
  private async redraw(): Promise<void> {
    if (this.busy || this.options.redraw) return;
    this.busy = true; this.updateRedraw();
    try {
      await playerClient.useItem('redraw'); this.options.redraw = true; this.renderHand();
      document.getElementById('opening-status')!.textContent = '已重抽五张起手牌，本局不能再次重抽。';
    } catch (error) { document.getElementById('opening-status')!.textContent = error instanceof Error ? error.message : '使用失败，请重试'; }
    finally { this.busy = false; this.updateRedraw(); }
  }
}

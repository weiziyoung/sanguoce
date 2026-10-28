import { playerClient, type PlayerClient } from './player-client.ts';
import { SHOP_ITEMS, type ShopItem } from './shop.ts';
import type { GameSettings } from './settings.ts';

export class ShopPanel {
  private dialog = document.getElementById('shop-dialog') as HTMLDialogElement;
  private busy = false;
  // Keep an order ID after a timeout so retrying cannot buy the same item twice.
  private orders: Partial<Record<ShopItem, { owner: string; id: string }>> = {};
  constructor(private settings: GameSettings, private client: PlayerClient = playerClient) {
    for (const id of ['shop-home', 'shop-game', 'shop-settlement', 'shop-selection'])
      document.getElementById(id)!.onclick = () => { void this.show(); };
    document.getElementById('shop-close')!.onclick = () => this.dialog.close();
    this.dialog.addEventListener('close', () => settings.setOpen(false));
    this.dialog.addEventListener('keydown', event => event.stopPropagation());
    for (const item of ['general', 'redraw'] as const) {
      const product = SHOP_ITEMS[item];
      document.getElementById(`shop-${item}-description`)!.textContent = product.description;
      document.getElementById(`shop-buy-${item}`)!.onclick = () => { void this.buy(item); };
    }
    client.subscribe(() => this.render()); this.render();
  }
  private render(): void {
    const session = this.client.session, wallet = session?.player.wallet;
    document.getElementById('shop-coins')!.textContent = session?.auth === 'unavailable' ? '—' : String(wallet?.coins ?? 0);
    for (const item of ['general', 'redraw'] as const) {
      document.getElementById(`shop-owned-${item}`)!.textContent = `已拥有 ${wallet?.items[item] ?? 0} 张`;
      const button = document.getElementById(`shop-buy-${item}`) as HTMLButtonElement;
      button.textContent = `${SHOP_ITEMS[item].price} 金币 · 购买一张`;
      button.disabled = this.busy || !session || session.auth === 'unavailable' || (wallet?.coins ?? 0) < SHOP_ITEMS[item].price;
    }
    for (const id of ['shop-home', 'shop-game', 'shop-settlement', 'shop-selection'])
      document.getElementById(id)!.textContent = `商店 · ${wallet?.coins ?? 0} 金币`;
  }
  private async show(): Promise<void> {
    if (this.dialog.open) return;
    this.dialog.showModal(); this.settings.setOpen(true);
    this.busy = true; this.render();
    try { await this.client.refresh(); document.getElementById('shop-status')!.textContent = ''; }
    catch (error) { this.status(error); }
    finally { this.busy = false; this.render(); }
  }
  private status(error: unknown): void { document.getElementById('shop-status')!.textContent = error instanceof Error ? error.message : '购买失败，请重试'; }
  private async buy(item: ShopItem): Promise<void> {
    if (this.busy || !this.client.session) return;
    this.busy = true; this.render();
    const owner = this.client.session.player.id;
    if (this.orders[item]?.owner !== owner) this.orders[item] = { owner, id: crypto.randomUUID() };
    try {
      await this.client.purchase(item, this.orders[item]!.id); delete this.orders[item];
      document.getElementById('shop-status')!.textContent = `已购买一张${SHOP_ITEMS[item].name}`;
    } catch (error) { this.status(error); }
    finally { this.busy = false; this.render(); }
  }
}

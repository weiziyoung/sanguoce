import type { WebGameDocument } from '../app/web-game-record.ts';
import { matchReward } from './match-reward.ts';

export const SHOP_ITEMS = {
  general: { name: '点将卡', price: 100, description: '选将时指定本局已启用武将包中的任意武将，出战时消耗。' },
  redraw: { name: '重抽卡', price: 50, description: '开战前重新抽取全部五张起手牌，每局限用一次。' },
} as const;
export type ShopItem = keyof typeof SHOP_ITEMS;
export interface Wallet { coins: number; items: Record<ShopItem, number>; }
export interface CoinReward { victory: number; contribution: number; total: number; }
export const COIN_REWARD_RULES = { duel: { victory: 20, contributionCap: 30 }, identity: { victory: 40, contributionCap: 80 } } as const;

/** Gold is separate from cumulative points. Only winners earn spendable currency. */
export function coinReward(game: WebGameDocument): CoinReward {
  const reward = matchReward(game);
  if (game.outcome.status !== 'finished' || !game.outcome.winners.includes(game.humanSeat))
    return { victory: 0, contribution: 0, total: 0 };
  const rule = COIN_REWARD_RULES[reward.mode];
  const contribution = Math.min(rule.contributionCap, reward.performance * 2);
  return { victory: rule.victory, contribution, total: rule.victory + contribution };
}
export function isShopItem(value: unknown): value is ShopItem { return value === 'general' || value === 'redraw'; }

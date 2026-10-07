import { cardText, type CardLike, type CardName } from '../../catalog.ts';
import type { DiscardReason } from '../domain/events.ts';
import { card } from '../domain/state-access.ts';
import type { GameState } from '../domain/state.ts';
import type { ContentRuntime } from './content-runtime.ts';
import { discardOwned } from './operations/cards.ts';
export const transformationCostLabel = (s: GameState, ids: readonly number[]) =>
  ids.length ? ids.map(id => cardText(card(s, id))).join('＋') : '无实体牌';
export function effectiveCard(s: GameState, actor: number, ids: number[], need: CardName,
  runtime: ContentRuntime, transformation?: string): CardLike {
  if (ids.length === 1 && !transformation) {
    if (!s.players[actor].hand.includes(ids[0]) || card(s, ids[0]).name !== need) throw new Error('实体响应牌已失效');
    const physical = card(s, ids[0]);
    const suit = runtime.queries.suit(s, actor, physical);
    return suit && suit !== physical.suit ? { ...physical, suit } : physical;
  }
  const candidate = runtime.transforms.candidates(s, actor, need)
    .find(item => item.virtual && (transformation ? item.transformation === transformation : true) &&
      item.ids.length === ids.length && item.ids.every((id, index) => id === ids[index]));
  if (!candidate) throw new Error('当前转化候选已失效');
  return candidate.effective;
}
export function effectiveSha(s: GameState, actor: number, ids: number[], runtime: ContentRuntime, transformation?: string): CardLike {
  return effectiveCard(s, actor, ids, 'sha', runtime, transformation);
}
export function spendCard(s: GameState, actor: number, ids: number[], need: CardName,
  reason: DiscardReason, runtime: ContentRuntime, transformation?: string,
  responseMode?: 'juedou'): CardLike {
  const effective = effectiveCard(s, actor, ids, need, runtime, transformation);
  for (const cid of ids) discardOwned(s, actor, cid, reason, undefined, responseMode);
  if (need === 'sha' && actor === s.active && s.phase === 'play' && s.shaPlayedOrRespondedInPlay !== undefined) {
    s.shaPlayedOrRespondedInPlay = true;
  }
  return effective;
}
export function spendSha(s: GameState, actor: number, ids: number[], reason: DiscardReason,
  runtime: ContentRuntime, transformation?: string): CardLike {
  return spendCard(s, actor, ids, 'sha', reason, runtime, transformation);
}

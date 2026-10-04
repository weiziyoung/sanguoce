import { cardText, type CardLike, type CardName } from '../../../catalog.ts';
import type { DiscardReason } from '../../domain/events.ts';
import { card } from '../../domain/state-access.ts';
import type { GameState } from '../../domain/state.ts';
import { discardOwned } from '../../rules/operations/cards.ts';
import { getStandardRuntime } from './runtime.ts';

const service = () => getStandardRuntime().transforms;
export const standardTransforms = {
  candidates: (s: GameState, actor: number, need: 'sha' | 'shan' | 'tao') => service().candidates(s, actor, need),
  virtualCard: (s: GameState, ids: readonly number[], need: 'sha' | 'shan' | 'tao') => service().virtualCard(s, ids, need),
  color: (s: GameState, ids: readonly number[]) => service().color(s, ids),
};
export const transformationKey = (id: string | undefined) => id === 'standard.zhangba' ? 'zhangba' : `transform:${id ?? 'unknown'}`;
export const transformationAction = (id: string | undefined) => id && id !== 'standard.zhangba' ? { transformation: id } : {};
export const transformationCostLabel = (s: GameState, ids: readonly number[]) =>
  ids.length ? ids.map(id => cardText(card(s, id))).join('＋') : '无实体牌';
export function shaCosts(s: GameState, id: number, runtime = getStandardRuntime()):
  { ids: number[]; virtual: boolean; transformation?: string }[] {
  return runtime.transforms.candidates(s, id, 'sha').map(({ ids, virtual, transformation }) => ({
    ids, virtual, ...(transformation ? { transformation } : {}),
  }));
}
export function virtualColor(s: GameState, ids: number[]): 'red' | 'black' | 'none' {
  return standardTransforms.color(s, ids);
}
export function effectiveCard(s: GameState, actor: number, ids: number[], need: CardName,
  runtime = getStandardRuntime(), transformation?: string): CardLike {
  if (ids.length === 1 && !transformation) {
    if (!s.players[actor].hand.includes(ids[0]) || card(s, ids[0]).name !== need) throw new Error('实体响应牌已失效');
    return card(s, ids[0]);
  }
  const candidate = runtime.transforms.candidates(s, actor, need)
    .find(item => item.virtual && (transformation ? item.transformation === transformation : true) &&
      item.ids.length === ids.length && item.ids.every((id, index) => id === ids[index]));
  if (!candidate) throw new Error('当前转化候选已失效');
  return candidate.effective;
}
export function effectiveSha(s: GameState, actor: number, ids: number[], runtime = getStandardRuntime(), transformation?: string): CardLike {
  return effectiveCard(s, actor, ids, 'sha', runtime, transformation);
}
export function spendCard(s: GameState, actor: number, ids: number[], need: CardName,
  reason: DiscardReason = 'respond', runtime = getStandardRuntime(), transformation?: string,
  responseMode?: 'juedou'): CardLike {
  const effective = effectiveCard(s, actor, ids, need, runtime, transformation);
  for (const cid of ids) discardOwned(s, actor, cid, reason, undefined, responseMode);
  if (need === 'sha' && actor === s.active && s.phase === 'play' && s.shaPlayedOrRespondedInPlay !== undefined) {
    s.shaPlayedOrRespondedInPlay = true;
  }
  return effective;
}
export function spendSha(s: GameState, actor: number, ids: number[], reason: DiscardReason = 'respond',
  runtime = getStandardRuntime(), transformation?: string): CardLike {
  return spendCard(s, actor, ids, 'sha', reason, runtime, transformation);
}

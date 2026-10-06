import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, GameState, PromptOf, TaskOf, TrickContext } from '../../domain/state.ts';
import { damage } from '../../rules/flows/damage-flow.ts';
import { discardOwned } from '../../rules/operations/cards.ts';

export function useWine(s: GameState, source: number): void {
  s.jiuUsed = (s.jiuUsed ?? 0) + 1;
  s.players[source].drunk = (s.players[source].drunk ?? 0) + 1;
  emitEvent(s, 'wineUsed', { player: source, bonus: s.players[source].drunk! });
}

export function resolveChain(s: GameState, { target }: TrickContext): void {
  s.players[target].chained = !s.players[target].chained;
  emitEvent(s, 'chainChanged', { player: target, chained: s.players[target].chained! });
}

export function resolveFireAttack(s: GameState, { source, target, cid }: TrickContext): void {
  if (!s.players[source].alive || !s.players[target].hand.length) return;
  setPrompt(s, target, 'fireAttackReveal', '【火攻】：展示一张手牌',
    s.players[target].hand.map(cid => leaf(`fire-reveal:${cid}`, `展示${cardText(s.cards[cid])}`,
      { type: 'reveal', cid })), { source, target, cid });
}

export function chooseFireReveal(s: GameState, prompt: PromptOf<'fireAttackReveal'>,
  action: ActionMap['fireAttackReveal']): void {
  if (prompt.actor !== prompt.context.target || !s.players[prompt.actor].hand.includes(action.cid)) throw new Error('火攻展示牌已失效');
  emitEvent(s, 'cardRevealed', { player: prompt.actor, card: action.cid, cause: 'huogong' });
  // Queue payment so loss triggers caused by the preceding use have fully settled.
  resolutionStack.enqueue(s, { kind: 'fireAttackPay', ...prompt.context, suit: s.cards[action.cid].suit });
}

export function offerFirePayment(s: GameState, task: TaskOf<'fireAttackPay'>): void {
  const { source, target, cid, suit } = task;
  if (!s.players[source].alive || !s.players[target].alive) return;
  const costs = s.players[source].hand.filter(id => s.cards[id].suit === suit);
  if (!costs.length) return;
  setPrompt(s, source, 'fireAttackPay', '【火攻】：弃置同花色手牌，造成1点火焰伤害？', [
    ...costs.map(cid => leaf(`fire-pay:${cid}`, `弃置${cardText(s.cards[cid])}`, { type: 'discard', cid })),
    leaf('fire-pay:pass', '放弃火攻', { type: 'pass' }),
  ], { source, target, cid, suit });
}

export function chooseFirePayment(s: GameState, prompt: PromptOf<'fireAttackPay'>,
  action: ActionMap['fireAttackPay']): void {
  if (action.type === 'pass') return;
  const { source, target, cid, suit } = prompt.context;
  if (prompt.actor !== source || !s.players[source].hand.includes(action.cid) || s.cards[action.cid].suit !== suit) throw new Error('火攻费用已失效');
  discardOwned(s, source, action.cid);
  damage(s, target, source, 1, null, cid, { nature: 'fire' });
}

export function applySupplyJudgement(s: GameState, owner: number, cid: number, result: number | null): void {
  discardOwned(s, owner, cid);
  if (result === null || s.cards[result].suit !== 'club') s.skipDraw = true;
}

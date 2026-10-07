import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { GameState, PromptOf, ActionMap } from '../../domain/state.ts';
import type { ContentRuntime } from '../content-runtime.ts';
import { cardMovement } from '../operations/card-movement-service.ts';

/** Both players commit from their own hand before either card is made public. */
export class PindianFlow {
  private runtime: ContentRuntime;
  constructor(runtime: ContentRuntime) { this.runtime = runtime; }
  begin(s: GameState, owner: number, target: number, ability: string): void {
    if (owner === target || !s.players[owner].alive || !s.players[target].alive ||
      !s.players[owner].hand.length || !s.players[target].hand.length) throw new Error('拼点双方必须存活且有手牌');
    resolutionStack.open(s, 'pindian', { owner, target, ability, sourceCard: null, targetCard: null }, [{ kind: 'pindianOffer' }]);
  }
  offer(s: GameState): void {
    const d = resolutionStack.require(s, 'pindian').data;
    const actor = d.sourceCard === null ? d.owner : d.target;
    if (!s.players[actor].alive || !s.players[actor].hand.length) return;
    setPrompt(s, actor, 'pindian', `【${this.runtime.content.requireSkill(d.ability).label}】：选择一张手牌拼点（点数大者胜，平局发起者未赢）`,
      s.players[actor].hand.map(cid => leaf(`pindian:${cid}`, cardText(s.cards[cid]), { type: 'pindian', cid })),
      { ability: d.ability, source: d.owner, target: d.target });
  }
  choose(s: GameState, prompt: PromptOf<'pindian'>, action: ActionMap['pindian']): void {
    const d = resolutionStack.require(s, 'pindian').data;
    const actor = d.sourceCard === null ? d.owner : d.target;
    if (actor !== prompt.actor || !s.players[actor].hand.includes(action.cid)) throw new Error('拼点牌已失效');
    if (d.sourceCard === null) { d.sourceCard = action.cid; resolutionStack.enqueue(s, { kind: 'pindianOffer' }); }
    else { d.targetCard = action.cid; resolutionStack.enqueue(s, { kind: 'pindianResolve' }); }
  }
  resolve(s: GameState): void {
    const d = resolutionStack.require(s, 'pindian').data;
    if (d.sourceCard === null || d.targetCard === null) return;
    const won = s.cards[d.sourceCard].rank > s.cards[d.targetCard].rank;
    cardMovement.move(s, [d.sourceCard], { kind: 'table' }, d.owner);
    cardMovement.move(s, [d.targetCard], { kind: 'table' }, d.target);
    emitEvent(s, 'pindianRevealed', { source: d.owner, target: d.target, sourceCard: d.sourceCard, targetCard: d.targetCard, won, ability: d.ability });
    cardMovement.move(s, [d.sourceCard, d.targetCard], { kind: 'discard' });
    resolutionStack.enqueue(s, { kind: 'contentCallback', ability: d.ability, owner: d.owner, context: { timing: 'pindian', target: d.target, won } });
  }
}

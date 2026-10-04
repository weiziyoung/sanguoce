import { cardText, type CardName } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import { seatOrder } from '../../domain/state-access.ts';
import type { ActionMap, GameState, PromptOf, Task } from '../../domain/state.ts';
import { cardMovement } from '../operations/card-movement-service.ts';
import { deckService } from '../operations/deck-service.ts';
import type { ContentRuntime } from '../content-runtime.ts';

/** The revealed card stays in a physical zone until all replacement offers finish. */
export class JudgementFlow {
  readonly runtime: ContentRuntime;
  constructor(runtime: ContentRuntime) { this.runtime = runtime; }
  begin(state: GameState, owner: number, reason: CardName, then: Task, label = this.runtime.content.card(reason).label): void {
    resolutionStack.open(state, 'judgement', { owner, reason, label, currentId: null, finalId: null,
      candidates: null, cursor: 0 }, [
      { kind: 'judgementDraw' }, { kind: 'judgementOffer' }, { kind: 'judgementFinalize' }, then,
      { kind: 'judgementTriggers' },
    ]);
  }
  draw(state: GameState): void {
    const frame = resolutionStack.require(state, 'judgement');
    frame.data.currentId = deckService.takeTop(state, 1, { kind: 'table' })[0] ?? null;
  }
  offer(state: GameState): void {
    const frame = resolutionStack.require(state, 'judgement');
    const data = frame.data;
    if (data.currentId === null) return;
    if (data.candidates === null) {
      const seats = seatOrder(state, state.active);
      data.candidates = seats.flatMap(owner =>
        this.runtime.abilities.list(state, owner).filter(skill => skill.judgement)
          .map(skill => ({ owner, ability: skill.id }))).sort((a, b) =>
          seats.indexOf(a.owner) - seats.indexOf(b.owner) ||
          a.ability.localeCompare(b.ability));
    }
    while (data.cursor < data.candidates.length) {
      const candidate = data.candidates[data.cursor++];
      if (!this.runtime.abilities.has(state, candidate.owner, candidate.ability)) continue;
      const skill = this.runtime.content.requireSkill(candidate.ability);
      const ids = skill.judgement?.cards(state, candidate.owner) ?? [];
      if (!ids.length) continue;
      if (ids.some(id => !state.players[candidate.owner].hand.includes(id))) throw new Error('改判候选必须在当前手牌中');
      setPrompt(state, candidate.owner, 'judgeReplace',
        `${state.players[data.owner].label}的【${data.label}】判定牌为${cardText(state.cards[data.currentId])}；是否发动【${skill.label ?? skill.id}】？`,
        [...ids.map(id => leaf(`judge-replace:${candidate.ability}:${id}`, `打出${cardText(state.cards[id])}改判`,
          { type: 'replace' as const, cid: id })),
        leaf(`judge-replace:${candidate.ability}:pass`, '不改判', { type: 'pass' })],
        { ability: candidate.ability, owner: candidate.owner, subject: data.owner,
          reason: data.reason, currentId: data.currentId });
      return;
    }
  }
  choice(state: GameState, prompt: PromptOf<'judgeReplace'>, action: ActionMap['judgeReplace']): void {
    const frame = resolutionStack.require(state, 'judgement');
    const data = frame.data;
    const candidate = data.candidates?.[data.cursor - 1];
    if (!candidate || candidate.owner !== prompt.actor || candidate.owner !== prompt.context.owner ||
      candidate.ability !== prompt.context.ability) throw new Error('改判选择与结算帧不匹配');
    if (action.type === 'replace') {
      const skill = this.runtime.content.requireSkill(candidate.ability);
      const allowed = this.runtime.abilities.has(state, candidate.owner, candidate.ability) &&
        skill.judgement?.cards(state, candidate.owner).includes(action.cid);
      if (!allowed || data.currentId === null || !state.table.includes(data.currentId)) throw new Error('改判牌或能力已失效');
      const oldCard = data.currentId;
      cardMovement.move(state, [oldCard], { kind: 'discard' });
      cardMovement.move(state, [action.cid], { kind: 'table' }, candidate.owner);
      data.currentId = action.cid;
      emitEvent(state, 'judgementReplaced', { player: data.owner, owner: candidate.owner, reason: data.reason,
        reasonLabel: data.label, oldCard, newCard: action.cid, ability: candidate.ability, label: skill.label ?? candidate.ability });
    }
    resolutionStack.enqueue(state, { kind: 'judgementOffer' });
  }
  finalize(state: GameState): void {
    const frame = resolutionStack.require(state, 'judgement');
    const id = frame.data.currentId;
    if (id === null) return;
    if (!state.table.includes(id)) throw new Error('最终判定牌不在处理区');
    cardMovement.move(state, [id], { kind: 'discard' });
    frame.data.finalId = id;
    emitEvent(state, 'judged', { player: frame.data.owner, reason: frame.data.reason,
      reasonLabel: frame.data.label, card: id });
  }
  after(state: GameState): void {
    const frame = resolutionStack.require(state, 'judgement');
    const { owner, reason, finalId } = frame.data;
    if (finalId === null || !this.runtime.abilities.list(state, owner).some(skill =>
      skill.trigger?.event === 'judgementApplied')) return;
    resolutionStack.enqueue(state, { kind: 'openTriggers', signal: {
      kind: 'judgementApplied', data: { player: owner, reason, card: finalId },
    }, then: [] });
  }
}

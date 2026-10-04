import { emitEvent } from '../../../domain/event-journal.ts';
import { cardText, type CardName } from '../../../../catalog.ts';
import { leaf, setPrompt } from '../../../core/decision-manager.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { alive, card, handCards, nextAlive, person, push } from '../../../domain/state-access.ts';
import type { ActionMap, GameState, PromptOf, Task } from '../../../domain/state.ts';
import { displayName } from '../../../presentation/card-label.ts';
import { discardOwned } from '../../../rules/operations/cards.ts';

export function beginNullify(s: GameState, effect: Task | null, cancel: Task | null,
  source: number, target: number, cname: CardName): void {
  resolutionStack.open(s, 'nullification', {
    effect, cancel, source, target, cname, parity: 0, passed: [], cursor: target, result: null,
  }, [{ kind: 'nullifyPoll' }]);
}

export function promptNullify(s: GameState): void {
  const n = resolutionStack.require(s, 'nullification').data;
  if (!person(s, n.target).alive) return;
  const living = alive(s);
  while (!living.every(id => n.passed.includes(id))) {
    const actor = n.cursor;
    if (person(s, actor).alive && !n.passed.includes(actor)) {
      const cards = handCards(s, actor, 'wuxie');
      if (cards.length) {
        setPrompt(s, actor, 'nullify',
          `【${displayName(n.cname, s.cards)}】即将对${person(s, n.target).label}生效：使用【无懈可击】？`,
          [...cards.map(cid => leaf(`nullify:${cid}`, `使用${cardText(card(s, cid))}`, { type: 'nullify', cid })),
          leaf('nullify-pass', '不使用【无懈可击】', { type: 'pass' })]);
        return;
      }
      n.passed.push(actor);
    }
    n.cursor = nextAlive(s, actor);
  }
  n.result = n.parity % 2 === 0 ? 'effective' : 'cancelled';
  if (n.result === 'effective') {
    if (n.effect) push(s, n.effect);
  } else {
    emitEvent(s, 'trickCancelled', { cname: n.cname, target: n.target });
    if (n.cancel) push(s, n.cancel);
  }
}

export function handleNullifyChoice(s: GameState, prompt: PromptOf<'nullify'>, data: ActionMap['nullify']): void {
  const n = resolutionStack.require(s, 'nullification').data;
  const actor = prompt.actor;
  if (data.type === 'nullify') {
    discardOwned(s, actor, data.cid, 'use');
    const parityBefore = n.parity;
    n.parity++;
    n.passed = [];
    emitEvent(s, 'nullificationUsed', { player: actor, card: data.cid, cname: n.cname,
      target: n.target, parityBefore });
  } else n.passed.push(actor);
  n.cursor = nextAlive(s, actor);
  push(s, { kind: 'nullifyPoll' });
}

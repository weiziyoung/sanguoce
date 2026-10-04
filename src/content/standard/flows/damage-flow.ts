import { emitEvent } from '../../../domain/event-journal.ts';
import type { CardLike } from '../../../../catalog.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { person } from '../../../domain/state-access.ts';
import type { GameState, Task } from '../../../domain/state.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { beginDying } from './dying-flow.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';

export function damage(s: GameState, target: number, source: number | null, amount = 1,
  continuation: Task | null = null, causeCard: CardLike | number | null = null,
  intent: { redirectedBy?: number; forcedBy?: number } = {}): void {
  resolutionStack.open(s, 'damage', { target, source, amount, card: causeCard, ...intent },
    [{ kind: 'damageApply' }, ...(continuation ? [continuation] : [])]);
}

export function handleDamageApplyTask(s: GameState, runtime: ContentRuntime = getStandardRuntime()): void {
  const { target, source, amount, card, redirectedBy, forcedBy } = resolutionStack.require(s, 'damage').data;
  const p = person(s, target);
  if (!p.alive) return;
  const actual = runtime.queries.damageAmount(s, source, target, card, amount);
  if (!Number.isInteger(actual) || actual < 0) throw new Error('伤害修正结果无效');
  if (!actual) return;
  vitals.loseHp(s, target, actual);
  emitEvent(s, 'damaged', { target, source, amount: actual, hp: p.hp, maxHp: p.maxHp, card,
    ...(redirectedBy === undefined ? {} : { redirectedBy }),
    ...(forcedBy === undefined ? {} : { forcedBy }) });
  if (runtime.triggers.forEvent('damageTaken').length) {
    resolutionStack.enqueue(s, { kind: 'openTriggers', signal: {
      kind: 'damageTaken', data: { target, source, amount: actual, card },
    }, then: [] });
  }
  if (p.hp <= 0) beginDying(s, target, null, { kind: 'damage', source, amount: actual, card });
}

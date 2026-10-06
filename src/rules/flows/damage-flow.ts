import { emitEvent } from '../../domain/event-journal.ts';
import type { CardLike, DamageNature } from '../../../catalog.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import { person, seatOrder } from '../../domain/state-access.ts';
import type { GameState, Task, TaskOf } from '../../domain/state.ts';
import { vitals } from '../operations/vitals-service.ts';
import { beginDying } from './dying-flow.ts';
import type { ContentRuntime } from '../content-runtime.ts';

export function damage(s: GameState, target: number, source: number | null, amount = 1,
  continuation: Task | null = null, causeCard: CardLike | number | null = null,
  intent: { redirectedBy?: number; forcedBy?: number; nature?: DamageNature; ignoreArmor?: boolean; propagated?: boolean } = {}): void {
  const cause = typeof causeCard === 'number' ? s.cards[causeCard] : causeCard;
  const nature = intent.nature ?? cause?.nature ?? 'normal';
  resolutionStack.open(s, 'damage', { target, source, amount, card: causeCard,
    ...(nature === 'normal' ? {} : { nature }), ...intent },
    [{ kind: 'damageApply' }, ...(continuation ? [continuation] : [])]);
}

export function handleDamageApplyTask(s: GameState, runtime: ContentRuntime): void {
  const context = resolutionStack.require(s, 'damage').data;
  const { target, source, amount, card, redirectedBy, forcedBy, propagated } = context;
  const p = person(s, target);
  if (!p.alive) return;
  const actual = runtime.queries.damageAmount(s, source, target, card, amount, context);
  if (!Number.isInteger(actual) || actual < 0) throw new Error('伤害修正结果无效');
  if (!actual) return;
  const nature = context.nature ?? 'normal';
  const linked = nature !== 'normal' && p.chained;
  const targets = linked && !propagated ? seatOrder(s, s.active).filter(id => id !== target && person(s, id).chained) : [];
  if (linked) {
    p.chained = false;
    emitEvent(s, 'chainChanged', { player: target, chained: false });
  }
  vitals.loseHp(s, target, actual);
  emitEvent(s, 'damaged', { target, source, amount: actual, hp: p.hp, maxHp: p.maxHp, card,
    ...(nature === 'normal' ? {} : { nature }), ...(propagated ? { propagated } : {}),
    ...(redirectedBy === undefined ? {} : { redirectedBy }), ...(forcedBy === undefined ? {} : { forcedBy }) });
  // LIFO enqueue: damage triggers and dying complete before each propagation.
  if (targets.length) resolutionStack.enqueue(s, ...targets.map(target => ({ kind: 'damagePropagate' as const,
    target, source, amount: actual, card, nature })));
  if (runtime.triggers.forEvent('damageTaken').length) resolutionStack.enqueue(s, {
    kind: 'openTriggers', signal: { kind: 'damageTaken', data: { target, source, amount: actual, card,
      ...(nature === 'normal' ? {} : { nature }) } }, then: [],
  });
  if (p.hp <= 0) beginDying(s, target, null, { kind: 'damage', source, amount: actual, card });
}

export function handleDamagePropagationTask(s: GameState, task: TaskOf<'damagePropagate'>): void {
  if (!person(s, task.target).alive || !person(s, task.target).chained) return;
  damage(s, task.target, task.source, task.amount, null, task.card, { nature: task.nature, propagated: true });
}

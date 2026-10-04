import { emitEvent } from '../domain/event-journal.ts';
import type { TriggerEvent } from '../domain/events.ts';
import { resolutionStack } from '../domain/resolution-stack.ts';
import { leaf, setPrompt } from '../core/decision-manager.ts';
import { seatService } from '../domain/seat-service.ts';
import type { ActionMap, GameState, PromptOf, TaskOf } from '../domain/state.ts';
import { TriggerRegistry, type TriggerDefinition } from './trigger-registry.ts';
import type { AbilityResolver } from './ability-resolver.ts';
import type { ContentRuntime } from './content-runtime.ts';

export function cancelTriggerWindow(state: GameState): void {
  resolutionStack.nearest(state, 'triggerWindow').data.cancelled = true;
}
/** Explicit timing windows, never synchronous callbacks from low-level state writes. */
export class TriggerResolver {
  readonly #registry: TriggerRegistry;
  readonly #abilities: AbilityResolver | null;
  readonly #runtime: ContentRuntime | null;
  constructor(registry: TriggerRegistry, abilities: AbilityResolver | null = null, runtime: ContentRuntime | null = null) {
    this.#registry = registry; this.#abilities = abilities; this.#runtime = runtime;
  }
  private granted(state: GameState, owner: number, ability: string | undefined): boolean {
    if (!ability) return true;
    if (!this.#abilities) throw new Error(`触发能力没有解析器：${ability}`);
    return this.#abilities.has(state, owner, ability);
  }
  open(state: GameState, task: TaskOf<'openTriggers'>): void {
    const eventId = emitEvent(state, task.signal.kind, task.signal.data);
    resolutionStack.open(state, 'triggerWindow', {
      eventId, candidates: [], cursor: 0, cancelled: false, then: task.then,
    }, [{ kind: 'triggerCollect' }, { kind: 'triggerNext' }]);
  }
  private event(state: GameState, id: number): TriggerEvent {
    const event = state.events[id - 1];
    if (!event || event.id !== id || !['attackTargeted', 'attackMissed', 'beforeAttackDamage', 'cardUsed', 'damageTaken', 'judgementApplied', 'cardsLost'].includes(event.kind)) {
      throw new Error(`触发事件不存在或类型不匹配：${id}`);
    }
    return event as TriggerEvent;
  }
  collect(state: GameState): void {
    const frame = resolutionStack.require(state, 'triggerWindow');
    const event = this.event(state, frame.data.eventId);
    const seats = seatService.livingOrder(state, state.active);
    const candidates = this.#registry.forEvent(event.kind).flatMap(raw => {
      // The registry filters by event kind before widening the callback type for dispatch.
      const definition = raw as TriggerDefinition;
      return [...new Set(definition.owners(state, event))].filter(owner => seats.includes(owner) &&
        this.granted(state, owner, definition.grantedBy) &&
        definition.eligible(state, event, owner, this.#abilities ?? undefined, this.#runtime ?? undefined))
        .flatMap(owner => {
          const count = definition.repeats?.(state, event, owner) ?? 1;
          if (!Number.isInteger(count) || count < 0 || count > 20) throw new Error(`触发次数无效：${definition.id}`);
          return Array.from({ length: count }, () => ({ definition: definition.id, owner, priority: definition.priority }));
        });
    });
    candidates.sort((a, b) => b.priority - a.priority || seats.indexOf(a.owner) - seats.indexOf(b.owner) ||
      (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0));
    frame.data.candidates = candidates.map(({ definition, owner }) => ({ definition, owner }));
  }
  next(state: GameState): void {
    const frame = resolutionStack.require(state, 'triggerWindow');
    if (frame.data.cancelled) return;
    if (frame.data.redirected) { resolutionStack.enqueue(state, ...frame.data.then); return; }
    const candidate = frame.data.candidates[frame.data.cursor++];
    if (!candidate) { resolutionStack.enqueue(state, ...frame.data.then); return; }
    resolutionStack.enqueue(state, { kind: 'triggerNext' });
    resolutionStack.open(state, 'trigger', { ...candidate, eventId: frame.data.eventId }, [{ kind: 'triggerExecute' }]);
  }
  execute(state: GameState): void {
    const instance = resolutionStack.require(state, 'trigger').data;
    const event = this.event(state, instance.eventId);
    const definition = this.#registry.get(instance.definition) as TriggerDefinition;
    if (!this.valid(state, definition, event, instance.owner)) return;
    if (definition.optional) {
      setPrompt(state, instance.owner, 'triggerConfirm', `是否发动【${definition.label ?? definition.id}】？`, [
        leaf(`trigger:${definition.id}:yes`, '发动', { type: 'yes' }),
        leaf(`trigger:${definition.id}:no`, '不发动', { type: 'no' }),
      ], { definition: definition.id, owner: instance.owner, eventId: event.id });
      return;
    }
    this.invoke(state, definition, event, instance.owner);
  }
  confirm(state: GameState, prompt: PromptOf<'triggerConfirm'>, action: ActionMap['triggerConfirm']): void {
    if (action.type === 'no') return;
    const { definition: id, owner, eventId } = prompt.context;
    const frame = resolutionStack.require(state, 'trigger');
    if (frame.data.definition !== id || frame.data.owner !== owner || frame.data.eventId !== eventId || prompt.actor !== owner) {
      throw new Error('触发确认与结算帧不匹配');
    }
    const definition = this.#registry.get(id) as TriggerDefinition;
    const event = this.event(state, eventId);
    if (!this.valid(state, definition, event, owner)) return;
    this.invoke(state, definition, event, owner);
  }
  private invoke(state: GameState, definition: TriggerDefinition, event: TriggerEvent, owner: number): void {
    emitEvent(state, 'triggerInvoked', { definition: definition.id, owner, eventId: event.id });
    if (definition.grantedBy) emitEvent(state, 'skillActivated', {
      ability: definition.grantedBy, label: definition.label ?? definition.id, owner, targets: [],
    });
    definition.execute(state, event, owner, this.#runtime ?? undefined);
  }
  private valid(state: GameState, definition: TriggerDefinition, event: TriggerEvent, owner: number): boolean {
    // A prior trigger may have killed the owner, removed equipment, or invalidated the target.
    return definition.event === event.kind && state.players.some(player => player.id === owner && player.alive) &&
      this.granted(state, owner, definition.grantedBy) && definition.owners(state, event).includes(owner) &&
      definition.eligible(state, event, owner, this.#abilities ?? undefined, this.#runtime ?? undefined);
  }
}

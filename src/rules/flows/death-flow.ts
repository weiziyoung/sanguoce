import { emitEvent } from "../../domain/event-journal.ts";
import { resolutionStack } from "../../domain/resolution-stack.ts";
import { handAndEquip, person } from '../../domain/state-access.ts';
import type { GameState, TaskOf } from '../../domain/state.ts';
import type { ModeEffect } from '../../domain/mode.ts';
import { ModeRegistry } from '../mode-registry.ts';
import { cardMovement } from '../operations/card-movement-service.ts';
import { discardOwned, draw } from '../operations/cards.ts';
import { vitals } from '../operations/vitals-service.ts';
import type { ContentRuntime } from '../content-runtime.ts';

/** Death mechanics are shared. Modes describe effects without mutating zones. */
export class DeathFlow {
  readonly #modes: ModeRegistry;
  readonly #runtime?: ContentRuntime;
  constructor(modes: ModeRegistry, runtime?: ContentRuntime) { this.#modes = modes; this.#runtime = runtime; }

  resolve(state: GameState, task: TaskOf<'death'>): void {
    const victim = person(state, task.context.target);
    if (!victim.alive || victim.hp > 0) return;
    const mode = this.#modes.get(state.mode.id);
    const ownHooks = (this.#runtime?.abilities.list(state, victim.id) ?? []).filter(skill => skill.onKilled);
    vitals.markDead(state, victim.id, task.context.cause.source);
    for (const skill of ownHooks) skill.onKilled!(state, victim.id, task.context.cause.source, this.#runtime!);
    this.effects(state, mode.onDeathWindow(state, task.context, 'reveal'));
    const hooks = state.players.filter(p => p.alive).flatMap(p =>
      (this.#runtime?.abilities.list(state, p.id) ?? []).filter(skill => skill.onDeath).map(skill => ({ owner: p.id, skill })));
    if (hooks.length && mode.evaluateOutcome(state).status === 'ongoing') {
      resolutionStack.enqueue(state, { kind: 'deathCleanup', context: task.context });
      for (const { owner, skill } of hooks.reverse()) skill.onDeath!(state, owner, victim.id, this.#runtime!);
    } else this.cleanup(state, { kind: 'deathCleanup', context: task.context });
  }

  cleanup(state: GameState, task: TaskOf<'deathCleanup'>): void {
    const victim = person(state, task.context.target);
    const mode = this.#modes.get(state.mode.id);
    const outcome = mode.evaluateOutcome(state);
    // Keep physical zones consistent even when this death ends the game.
    for (const cid of [...handAndEquip(state, victim.id), ...victim.judge]) {
      discardOwned(state, victim.id, cid);
    }
    for (const ids of Object.values(victim.piles ?? {})) cardMovement.move(state, [...ids], { kind: 'discard' });
    // Kill rewards belong to the death itself, including a death that ends the game.
    this.effects(state, mode.onDeathWindow(state, task.context, 'afterCleanup'));
    if (outcome.status !== 'ongoing') {
      state.outcome = outcome;
      this.effects(state, mode.onFinish(state));
      resolutionStack.abortAll(state);
      cardMovement.move(state, [...state.table], { kind: 'discard' });
      state.phase = 'finished';
      return;
    }
  }

  private effects(state: GameState, effects: readonly ModeEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'revealRoles':
          for (const player of effect.players) {
            state.mode.knownTo[player] = state.players.map(p => p.id);
          }
          emitEvent(state, 'rolesRevealed', { roles: effect.players.map(player => ({ player, role: state.mode.roles[player] })) });
          break;
        case 'draw': draw(state, effect.player, effect.count); break;
        case 'discardHandAndEquipment':
          for (const cid of handAndEquip(state, effect.player)) discardOwned(state, effect.player, cid);
          break;
      }
    }
  }
}

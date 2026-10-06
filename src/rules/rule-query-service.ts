import { seatService } from "../domain/seat-service.ts";
import type { AttackContext, ReadonlyGameState } from '../domain/state.ts';
import type { AbilityResolver } from './ability-resolver.ts';
import type { CardLike, CardName } from '../../catalog.ts';

/** Deterministic, side-effect-free modifiers supplied by the content assembly. */
export interface RuleModifier {
  distance?(s: ReadonlyGameState, from: number, to: number, current: number): number;
  attackRange?(s: ReadonlyGameState, actor: number, current: number): number;
  shaLimit?(s: ReadonlyGameState, actor: number, current: number): number;
  shaTargets?(s: ReadonlyGameState, actor: number, current: number): number;
  handLimit?(s: ReadonlyGameState, actor: number, current: number): number;
}
export class RuleQueryService {
  readonly #modifiers: readonly RuleModifier[];
  readonly #abilities: AbilityResolver | null;
  constructor(modifiers: readonly RuleModifier[] = [], abilities: AbilityResolver | null = null) {
    this.#modifiers = modifiers.map(modifier => Object.freeze({ ...modifier }));
    this.#abilities = abilities;
  }
  distance(s: ReadonlyGameState, from: number, to: number): number {
    if (from === to) return 0;
    let value = seatService.distance(s, from, to);
    for (const modifier of this.#modifiers) value = modifier.distance?.(s, from, to, value) ?? value;
    for (const owner of [from, to]) for (const skill of this.#abilities?.list(s, owner) ?? []) {
      value = skill.modifier?.distance?.(s, owner, from, to, value) ?? value;
    }
    return Math.max(1, value);
  }
  attackRange(s: ReadonlyGameState, actor: number): number {
    const weapon = this.#abilities?.equipped(s, actor, 'weapon');
    let value = weapon?.range ?? 1;
    for (const m of this.#modifiers) value = m.attackRange?.(s, actor, value) ?? value;
    for (const skill of this.#abilities?.list(s, actor) ?? []) value = skill.modifier?.attackRange?.(s, actor, value) ?? value;
    return value;
  }
  shaLimit(s: ReadonlyGameState, actor: number): number {
    let value = 1;
    for (const m of this.#modifiers) value = m.shaLimit?.(s, actor, value) ?? value;
    for (const skill of this.#abilities?.list(s, actor) ?? []) value = skill.modifier?.shaLimit?.(s, actor, value) ?? value;
    return value;
  }
  shaTargets(s: ReadonlyGameState, actor: number): number {
    let value = 1;
    for (const m of this.#modifiers) value = m.shaTargets?.(s, actor, value) ?? value;
    for (const skill of this.#abilities?.list(s, actor) ?? []) value = skill.modifier?.shaTargets?.(s, actor, value) ?? value;
    return value;
  }
  handLimit(s: ReadonlyGameState, actor: number): number {
    let value = s.players[actor].hp;
    for (const m of this.#modifiers) value = m.handLimit?.(s, actor, value) ?? value;
    for (const skill of this.#abilities?.list(s, actor) ?? []) value = skill.modifier?.handLimit?.(s, actor, value) ?? value;
    return Math.max(0, value);
  }
  trickDistanceLimit(s: ReadonlyGameState, actor: number, card: CardName): number {
    let value = 1;
    for (const skill of this.#abilities?.list(s, actor) ?? []) {
      value = skill.modifier?.trickDistanceLimit?.(s, actor, card, value) ?? value;
    }
    return value;
  }
  rescueRecovery(s: ReadonlyGameState, rescuer: number, victim: number): number {
    let value = 1;
    for (const skill of this.#abilities?.list(s, victim) ?? []) {
      value = skill.modifier?.rescueRecovery?.(s, victim, rescuer, victim, value) ?? value;
    }
    return value;
  }
  damageAmount(s: ReadonlyGameState, source: number | null, target: number,
    card: number | CardLike | null, initial: number, context?: import('../domain/resolution.ts').FrameData['damage']): number {
    let value = initial;
    for (const skill of source === null || context?.propagated ? [] : this.#abilities?.list(s, source) ?? []) {
      value = skill.modifier?.damageAmount?.(s, source!, target, card, value) ?? value;
    }
    if (context) for (const instance of this.#abilities?.instances(s, target) ?? []) {
      if (context.ignoreArmor && instance.source.kind === 'equipment' && instance.source.slot === 'armor') continue;
      value = instance.definition.modifier?.damageReceived?.(s, target, context, value) ?? value;
    }
    return value;
  }
  ignoresArmor(s: ReadonlyGameState, source: number): boolean {
    return (this.#abilities?.list(s, source) ?? []).some(skill => skill.modifier?.ignoresArmor?.(s, source));
  }
  attackEffective(s: ReadonlyGameState, attack: AttackContext): boolean {
    const ignores = attack.ignoreArmor || this.ignoresArmor(s, attack.source);
    return (this.#abilities?.instances(s, attack.target) ?? []).every(instance =>
      ignores && instance.source.kind === 'equipment' && instance.source.slot === 'armor' ||
      instance.definition.modifier?.attackEffective?.(s, attack.target, attack) !== false);
  }
  trickEffective(s: ReadonlyGameState, target: number, card: CardName): boolean {
    return (this.#abilities?.list(s, target) ?? []).every(skill => skill.modifier?.trickEffective?.(s, target, card) !== false);
  }
  canTarget(s: ReadonlyGameState, source: number, target: number, card: CardName, allowSelf = false): boolean {
    if (source === target && !allowSelf) return false;
    if (!s.players[source]?.alive || !s.players[target]?.alive) return false;
    return (this.#abilities?.list(s, target) ?? []).every(skill =>
      skill.modifier?.targetEnabled?.(s, target, source, target, card) !== false);
  }
  responseCount(s: ReadonlyGameState, source: number, target: number, mode: 'sha' | 'juedou'): number {
    let value = 1;
    for (const skill of this.#abilities?.list(s, source) ?? []) {
      value = skill.modifier?.responseCount?.(s, source, source, target, mode, value) ?? value;
    }
    if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error('响应次数无效');
    return value;
  }
  canSha(s: ReadonlyGameState, from: number, to: number, ignoreDistance = false): boolean {
    return from !== to && this.canTarget(s, from, to, 'sha') &&
      (ignoreDistance || this.distance(s, from, to) <= this.attackRange(s, from));
  }
}

import { emitEvent } from '../../domain/event-journal.ts';
import { person } from '../../domain/state-access.ts';
import type { GameState } from '../../domain/state.ts';
import { clearWine } from './wine-state.ts';

/** Low-level HP writes. Damage prevention and dying belong to the calling flow. */
export class VitalsService {
  recover(s: GameState, target: number, amount = 1, source: number = target): number {
    this.validate(amount);
    const p = person(s, target);
    const actual = Math.max(0, Math.min(amount, p.maxHp - p.hp));
    const before = p.hp;
    p.hp += actual;
    if (actual) emitEvent(s, 'hpChanged', { player: target, before, after: p.hp });
    if (actual) emitEvent(s, 'recovered', { player: target, source, amount: actual });
    return actual;
  }
  loseHp(s: GameState, target: number, amount: number): void {
    this.validate(amount);
    const before = person(s, target).hp;
    person(s, target).hp -= amount;
    emitEvent(s, 'hpChanged', { player: target, before, after: person(s, target).hp });
  }
  markDead(s: GameState, target: number, source: number | null = null): void {
    clearWine(s, target, 'death');
    person(s, target).alive = false;
    emitEvent(s, 'died', { target, source });
  }
  private validate(amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) throw new Error('体力变化必须为非负整数');
  }
}
export const vitals = new VitalsService();

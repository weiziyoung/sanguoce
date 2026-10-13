import type { RuleEvent } from '../domain/events.ts';

export interface BattleStat {
  seat: number;
  damageByTarget: Record<number, number>;
  damageTotal: number;
  healing: number;
  effectiveKills: number;
  enemyDamage: number;
  friendlyDamage: number;
  supportHealing: number;
  friendlyKills: number;
}

/** Final revealed roles define the two identity teams; the renegade has no allies. */
export function battleAllies(source: number, target: number, roles: Readonly<Record<number, string>>): boolean {
  if (source === target) return true;
  const a = roles[source], b = roles[target];
  return Boolean(a && b && ((['lord', 'loyalist'].includes(a) && ['lord', 'loyalist'].includes(b)) || a === 'rebel' && b === 'rebel'));
}

export function battleReport(seats: readonly number[], roles: Readonly<Record<number, string>>,
  events: readonly RuleEvent[]): BattleStat[] {
  const stats = new Map(seats.map(seat => [seat, {
    seat, damageByTarget: {} as Record<number, number>, damageTotal: 0, healing: 0, effectiveKills: 0,
    enemyDamage: 0, friendlyDamage: 0, supportHealing: 0, friendlyKills: 0,
  }]));
  for (const event of events) {
    if (event.kind === 'damaged') {
      const { source, target, amount } = event.data;
      if (source === null || source === target) continue;
      const stat = stats.get(source);
      if (!stat) continue;
      stat.damageByTarget[target] = (stat.damageByTarget[target] ?? 0) + amount;
      stat.damageTotal += amount;
      if (battleAllies(source, target, roles)) stat.friendlyDamage += amount;
      else stat.enemyDamage += amount;
    } else if (event.kind === 'recovered') {
      const source = event.data.source ?? event.data.player;
      const stat = stats.get(source);
      if (stat) {
        stat.healing += event.data.amount;
        if (battleAllies(source, event.data.player, roles)) stat.supportHealing += event.data.amount;
      }
    } else if (event.kind === 'died') {
      const { source, target } = event.data;
      if (source === null || source === undefined || source === target) continue;
      const stat = stats.get(source);
      if (stat) {
        if (battleAllies(source, target, roles)) stat.friendlyKills++;
        else stat.effectiveKills++;
      }
    }
  }
  return [...stats.values()];
}

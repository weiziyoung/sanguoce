import type { RuleEvent } from '../domain/events.ts';

export interface BattleStat {
  seat: number;
  damageByTarget: Record<number, number>;
  damageTotal: number;
  healing: number;
  effectiveKills: number;
}

export function battleReport(seats: readonly number[], roles: Readonly<Record<number, string>>,
  events: readonly RuleEvent[]): BattleStat[] {
  const stats = new Map(seats.map(seat => [seat, {
    seat, damageByTarget: {} as Record<number, number>, damageTotal: 0, healing: 0, effectiveKills: 0,
  }]));
  for (const event of events) {
    if (event.kind === 'damaged') {
      const { source, target, amount } = event.data;
      if (source === null || source === target) continue;
      const stat = stats.get(source);
      if (!stat) continue;
      stat.damageByTarget[target] = (stat.damageByTarget[target] ?? 0) + amount;
      stat.damageTotal += amount;
    } else if (event.kind === 'recovered') {
      const source = event.data.source ?? event.data.player;
      const stat = stats.get(source);
      if (stat) stat.healing += event.data.amount;
    } else if (event.kind === 'died') {
      const { source, target } = event.data;
      if (source === null || source === undefined || source === target) continue;
      const attacker = roles[source];
      const victim = roles[target];
      if ((attacker === 'loyalist' && victim === 'lord') ||
        (attacker === 'lord' && victim === 'loyalist') ||
        (attacker === 'rebel' && victim === 'rebel')) continue;
      const stat = stats.get(source);
      if (stat) stat.effectiveKills++;
    }
  }
  return [...stats.values()];
}

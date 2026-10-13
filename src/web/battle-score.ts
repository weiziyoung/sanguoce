import type { GameOutcome } from '../../contracts.ts';
import type { BattleStat } from './battle-report.ts';

export const BATTLE_SCORE_WEIGHTS = { damage: 3, healing: 2, kill: 5, victory: 10, renegadeVictory: 30, friendlyDamage: 3, friendlyKill: 8 } as const;
export interface BattleScore {
  seat: number; stat: BattleStat; total: number; rank: number; winner: boolean; mvp: boolean;
  points: { damage: number; healing: number; kills: number; victory: number; penalty: number };
}
export interface BattleAwards { scores: BattleScore[]; mvp: BattleScore | null; }

/** Scores summarize this match; winners alone are eligible for the MVP award. */
export function battleScores(stats: readonly BattleStat[], outcome: GameOutcome,
  roles: Readonly<Record<number, string>> = {}): BattleAwards {
  if (outcome.status === 'ongoing') throw new Error('对局尚未结束，不能评选 MVP');
  const winners = new Set(outcome.status === 'finished' ? outcome.winners : []);
  const w = BATTLE_SCORE_WEIGHTS;
  const scores: BattleScore[] = stats.map(stat => {
    const points = { damage: stat.enemyDamage * w.damage, healing: stat.supportHealing * w.healing,
      kills: stat.effectiveKills * w.kill, victory: winners.has(stat.seat) ? roles[stat.seat] === 'renegade' ? w.renegadeVictory : w.victory : 0,
      penalty: stat.friendlyDamage * w.friendlyDamage + stat.friendlyKills * w.friendlyKill };
    return { seat: stat.seat, stat, points,
      total: Math.max(0, points.damage + points.healing + points.kills + points.victory - points.penalty),
      rank: 0, winner: winners.has(stat.seat), mvp: false };
  }).sort((a, b) => b.total - a.total || b.stat.effectiveKills - a.stat.effectiveKills ||
    b.stat.enemyDamage - a.stat.enemyDamage || b.stat.supportHealing - a.stat.supportHealing || a.seat - b.seat);
  scores.forEach((score, i) => { score.rank = i + 1; });
  const mvp = scores.find(score => score.winner) ?? null;
  if (mvp) mvp.mvp = true;
  return { scores, mvp };
}

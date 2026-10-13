import type { WebGameDocument } from '../app/web-game-record.ts';
import { battleReport } from './battle-report.ts';
import { battleScores } from './battle-score.ts';

/** Progression rewards are capped by mode; changing rules does not rewrite past ledger entries. */
export const MATCH_REWARD_RULES = {
  duel: { completion: 5, performanceCap: 15, victory: 10, renegade: 0 },
  identity: { completion: 40, performanceCap: 40, victory: 40, renegade: 60 },
} as const;

export interface MatchReward {
  ruleVersion: 1;
  mode: 'duel' | 'identity';
  completion: number;
  performance: number;
  victory: number;
  renegade: number;
  total: number;
}

/** Shared display/server calculation; the server ignores any client-submitted reward fields. */
export function matchReward(game: WebGameDocument): MatchReward {
  if (game.outcome.status === 'ongoing') throw new Error('对局尚未结束');
  const mode = game.config.mode === 'identity' ? 'identity' : 'duel';
  const seats = game.players.map(player => player.id);
  if (!seats.includes(game.humanSeat) || new Set(seats).size !== seats.length || seats.some(id => !Number.isInteger(id) || id < 0))
    throw new Error('无效的玩家记录');
  // Browser journals are untrusted input: malformed events must never produce NaN or inflated arithmetic.
  for (const event of game.events) {
    if (!event || typeof event !== 'object') throw new Error('无效的事件');
    if (event.kind !== 'damaged' && event.kind !== 'recovered' && event.kind !== 'died') continue;
    if (!event.data || typeof event.data !== 'object') throw new Error('无效的计分事件');
    if (event.kind === 'damaged' || event.kind === 'recovered') {
      const amount = event.data.amount;
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000) throw new Error('无效的计分数值');
    }
    const source = event.data.source;
    const target = event.kind === 'recovered' ? event.data.player : event.data.target;
    if ((source !== undefined && source !== null && !seats.includes(source)) || !seats.includes(target))
      throw new Error('无效的计分角色');
  }
  const roles = mode === 'identity' ? Object.fromEntries(game.players.map(player => [player.id, player.role ?? ''])) : {};
  const stats = battleReport(seats, roles, game.events);
  const score = battleScores(stats, game.outcome, roles).scores.find(score => score.seat === game.humanSeat)!;
  const rule = MATCH_REWARD_RULES[mode];
  const performance = Math.min(rule.performanceCap,
    Math.max(0, score.points.damage + score.points.healing + score.points.kills - score.points.penalty));
  const victory = score.winner ? rule.victory : 0;
  const renegade = score.winner && mode === 'identity' && roles[game.humanSeat] === 'renegade' ? rule.renegade : 0;
  return { ruleVersion: 1, mode, completion: rule.completion, performance, victory, renegade,
    total: rule.completion + performance + victory + renegade };
}

export function rewardDescription(reward: MatchReward): string {
  return `完成对局 +${reward.completion} · 表现 +${reward.performance}${reward.victory ? ` · 获胜 +${reward.victory}` : ''}${reward.renegade ? ` · 内奸获胜 +${reward.renegade}` : ''}`;
}

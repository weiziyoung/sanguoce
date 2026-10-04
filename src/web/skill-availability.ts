import type { Observation } from '../../contracts.ts';

/** Explain disabled tiles from public facts; legal decisions still control availability. */
export function unavailableSkillDetail(ability: string, obs: Observation): string {
  if (ability === 'standard.jieyin') {
    if (obs.active !== obs.self.id || obs.phase !== 'play') return '仅限你的出牌阶段';
    if (!obs.others.some(player => player.alive && player.sex === 'male' && player.hp < player.maxHp))
      return '没有受伤的男性目标';
    if (obs.self.handCount < 2) return '需要至少两张手牌';
  }
  return '当前不可发动';
}

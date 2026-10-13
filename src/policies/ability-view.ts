import type { VisiblePlayer } from '../../contracts.ts';
import { allContent } from '../app/game-content.ts';
export function publicAbilities(player: VisiblePlayer): readonly string[] {
  return player.generalSkillsDisabled ? [] : [...new Set([...(player.general ? (allContent.generals().find(g => g.id === player.general)?.abilities ?? []) : []), ...(player.gainedAbilities ?? [])])];
}
export const hasPublicAbility = (player: VisiblePlayer, id: string) => publicAbilities(player).includes(id);

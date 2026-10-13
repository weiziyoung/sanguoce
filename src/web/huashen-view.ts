import type { Observation } from '../../contracts.ts';
import { allContent } from '../app/game-content.ts';
import { huashenSkills } from '../content/mountain/generals/zuoci.ts';
import { STANDARD_SKILL_HELP } from '../content/standard/skill-help.ts';

/** Read only the viewer's private pool; never infer unrevealed avatars from opponents. */
export function huashenCards(obs: Observation) {
  const avatar = obs.self.huashen;
  return (avatar?.generals ?? []).map(id => {
    const general = allContent.general(id);
    return { id, label: general.label, selected: avatar?.selected === id,
      skills: huashenSkills({ content: allContent }, id).map(ability => ({
        id: ability, label: allContent.requireSkill(ability).label ?? ability,
        help: STANDARD_SKILL_HELP[ability] ?? '',
        selected: avatar?.selected === id && avatar.ability === ability,
      })) };
  });
}

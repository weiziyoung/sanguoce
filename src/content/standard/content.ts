import { NAMES, STANDARD_DECK } from '../../../catalog.ts';
import { ContentRegistry, type ContentPack, type SkillDefinition } from '../../rules/content-registry.ts';
import { STANDARD_CARD_SPECS } from './card-specs.ts';
import { standardTriggerDefinitions } from './triggers.ts';
import { standardGeneralDefinitions, standardGeneralSkills } from './generals.ts';

const standardSkills: readonly SkillDefinition[] = [
  ...standardTriggerDefinitions.map(trigger => ({ id: trigger.id, label: trigger.label, trigger })),
  ...standardGeneralSkills,
  { id: 'standard.bagua', label: NAMES.bagua, modifier: { autoShan: () => true } },
  { id: 'standard.qinggang', label: NAMES.qinggang, modifier: { ignoresArmor: () => true } },
  { id: 'standard.plusHorse', label: '防御坐骑', modifier: {
    distance: (_s, owner, _from, to, current) => owner === to ? current + 1 : current,
  } },
  { id: 'standard.minusHorse', label: '进攻坐骑', modifier: {
    distance: (_s, owner, from, _to, current) => owner === from ? current - 1 : current,
  } },
  { id: 'standard.zhuge', label: NAMES.zhuge, modifier: { shaLimit: () => Infinity } },
  { id: 'standard.fangtian', label: NAMES.fangtian, modifier: {
    shaTargets: (state, owner, current) => state.players[owner].hand.length === 1 ? current + 2 : current,
  } },
  { id: 'standard.zhangba', label: NAMES.zhangba, transformation: {
    id: 'standard.zhangba', grantedBy: 'standard.zhangba', produces: 'sha',
    costs: (state, owner) => state.players[owner].hand.flatMap((id, index) =>
      state.players[owner].hand.slice(index + 1).map(other => [id, other])),
  } },
];

export const standardPack: ContentPack = {
  id: 'standard', cards: STANDARD_CARD_SPECS, skills: standardSkills,
  generals: standardGeneralDefinitions, deck: STANDARD_DECK,
};
export const standardContent = new ContentRegistry([standardPack]);

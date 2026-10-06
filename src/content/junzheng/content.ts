import { JUNZHENG_DECK, NAMES } from '../../../catalog.ts';
import type { CardDefinition, ContentPack, SkillDefinition } from '../../rules/content-registry.ts';
import { vitals } from '../../rules/operations/vitals-service.ts';
import { JUNZHENG_CARD_SPECS } from './card-specs.ts';
import { useWine, resolveChain, resolveFireAttack, applySupplyJudgement } from './effects.ts';

const skills: readonly SkillDefinition[] = [
  { id: 'junzheng.zhuque', label: NAMES.zhuque, prepareAttack: {
    available: (_state, _source, nature) => nature === 'normal', nature: 'fire',
  } },
  { id: 'junzheng.guding', label: NAMES.guding, modifier: {
    damageAmount: (state, _owner, target, card, current) => {
      const cause = typeof card === 'number' ? state.cards[card] : card;
      return cause?.name === 'sha' && state.players[target].hand.length === 0 ? current + 1 : current;
    },
  } },
  { id: 'junzheng.tengjia', label: NAMES.tengjia, modifier: {
    attackEffective: (_state, _owner, attack) => (attack.nature ?? 'normal') !== 'normal',
    trickEffective: (_state, _owner, card) => card !== 'nanman' && card !== 'wanjian',
    damageReceived: (_state, _owner, context, current) => context.nature === 'fire' ? current + 1 : current,
  } },
  { id: 'junzheng.baiyin', label: NAMES.baiyin, modifier: {
    damageReceived: (_state, _owner, _context, current) => Math.min(1, current),
  } },
];

const cards: readonly CardDefinition[] = JUNZHENG_CARD_SPECS.map(spec => ({ ...spec,
  ...(spec.id === 'jiu' ? { useEffect: useWine } : {}),
  ...(spec.id === 'huogong' ? { trickEffect: resolveFireAttack } : {}),
  ...(spec.id === 'tiesuo' ? { trickEffect: resolveChain } : {}),
  ...(spec.id === 'bingliang' ? { delayedEffect: applySupplyJudgement } : {}),
  ...(spec.id === 'baiyin' ? { leaveEquipment: (state, owner) => {
    if (state.players[owner].alive) vitals.recover(state, owner);
  } } : {}),
}));

/** No generals or modes are introduced by this pack. */
export const junzhengPack: ContentPack = { id: 'junzheng', cards, skills, generals: [], deck: JUNZHENG_DECK };

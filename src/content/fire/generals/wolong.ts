import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class WoLongGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.wolong', label: '卧龙诸葛亮', sex: 'male', group: 'shu', hp: 3, abilities: ['fire.bazhen', 'fire.huoji', 'fire.kanpo'] } as const;
  readonly skills = [{ id: 'fire.bazhen', label: '八阵', modifier: { autoShan: (s, owner) => s.players[owner].equip.armor === null } },
    { id: 'fire.huoji', label: '火计', transformation: { id: 'fire.huoji', grantedBy: 'fire.huoji', produces: 'huogong',
      costs: (s, owner) => s.players[owner].hand.filter(id => cardColor(s.cards[id]) === 'red').map(id => [id]) } },
    { id: 'fire.kanpo', label: '看破', transformation: { id: 'fire.kanpo', grantedBy: 'fire.kanpo', produces: 'wuxie',
      costs: (s, owner) => s.players[owner].hand.filter(id => cardColor(s.cards[id]) === 'black').map(id => [id]) } },
  ] satisfies StandardGeneralModule['skills'];
}

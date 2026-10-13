import { cardColor, cardTypeOf } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class XuHuangGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.xuhuang', label: '徐晃', sex: 'male', group: 'wei', hp: 4, abilities: ['forest.duanliang'] } as const;
  readonly skills = [{ id: 'forest.duanliang', label: '断粮', transformation: {
    id: 'forest.duanliang', grantedBy: 'forest.duanliang', produces: 'bingliang', allowedZones: ['hand', 'equip'],
    costs: (s, owner) => [...s.players[owner].hand, ...Object.values(s.players[owner].equip).filter((id): id is number => id !== null)]
      .filter(id => cardColor(s.cards[id]) === 'black' && ['basic', 'equip'].includes(cardTypeOf(s.cards[id]))).map(id => [id]),
  }, modifier: { trickDistanceLimit: (_s, _owner, card, current) => card === 'bingliang' ? Math.max(2, current) : current } }] satisfies StandardGeneralModule['skills'];
}

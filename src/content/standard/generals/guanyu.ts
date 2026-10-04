import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class GuanYuGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.guanyu', label: '关羽', sex: 'male', group: 'shu', hp: 4,
    abilities: ['standard.wusheng'] } as const;
  readonly skills = [{ id: 'standard.wusheng', label: '武圣', transformation: {
    id: 'standard.wusheng', grantedBy: 'standard.wusheng', produces: 'sha',
    allowedZones: ['hand', 'equip'],
    costs: (state, owner) => [
      ...state.players[owner].hand,
      ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null),
    ].filter(id => cardColor(state.cards[id]) === 'red' && state.cards[id].name !== 'sha').map(id => [id]),
  } }] satisfies StandardGeneralModule['skills'];
}

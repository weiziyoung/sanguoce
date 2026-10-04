import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class GanNingGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.ganning', label: '甘宁', sex: 'male', group: 'wu', hp: 4,
    abilities: ['standard.qixi'] } as const;
  readonly skills = [{ id: 'standard.qixi', label: '奇袭', transformation: {
    id: 'standard.qixi', grantedBy: 'standard.qixi', produces: 'guohe',
    allowedZones: ['hand', 'equip'],
    costs: (state, owner) => [
      ...state.players[owner].hand,
      ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null),
    ].filter(id => cardColor(state.cards[id]) === 'black').map(id => [id]),
  } }] satisfies StandardGeneralModule['skills'];
}

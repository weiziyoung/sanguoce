import { cardColor } from '../../../../catalog.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class HuaTuoGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.huatuo', label: '华佗', sex: 'male', group: 'qun', hp: 3,
    abilities: ['standard.qingnang', 'standard.jijiu'] } as const;
  readonly skills = [
    { id: 'standard.qingnang', label: '青囊', active: {
      limit: 'oncePerTurn', cost: 'discardOwned',
      costs: (state, owner) => state.players[owner].hand.map(id => [id]),
      targets: state => state.players.filter(player => player.alive && player.hp < player.maxHp).map(player => [player.id]),
      execute: (state, owner, _costs, targets) => vitals.recover(state, targets[0], 1, owner),
    } },
    { id: 'standard.jijiu', label: '急救', transformation: {
      id: 'standard.jijiu', grantedBy: 'standard.jijiu', produces: 'tao', allowedZones: ['hand', 'equip'],
      costs: (state, owner) => state.active === owner ? [] : [
        ...state.players[owner].hand,
        ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null),
      ].filter(id => cardColor(state.cards[id]) === 'red').map(id => [id]),
    } },
  ] satisfies StandardGeneralModule['skills'];
}

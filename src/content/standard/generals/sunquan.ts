import { draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class SunQuanGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.sunquan', label: '孙权', sex: 'male', group: 'wu', hp: 4,
    abilities: ['standard.zhiheng', 'standard.jiuyuan'] } as const;
  readonly skills = [
    { id: 'standard.zhiheng', label: '制衡', active: {
      limit: 'oncePerTurn', cost: 'discardOwned',
      selection: { min: 1, selectable: (state, owner) => [
        ...state.players[owner].hand,
        ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null),
      ] },
      targets: () => [[]],
      execute: (state, owner, costs) => draw(state, owner, costs.length),
    } },
    { id: 'standard.jiuyuan', label: '救援', lordSkill: true, modifier: {
      rescueRecovery: (state, owner, rescuer, victim, current) =>
        state.mode.id === 'identity' && state.mode.roles[owner] === 'lord' && owner === victim &&
        rescuer !== owner && state.players[rescuer].group === 'wu' ? current + 1 : current,
    } },
  ] satisfies StandardGeneralModule['skills'];
}

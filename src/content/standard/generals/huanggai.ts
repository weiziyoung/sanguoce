import { draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class HuangGaiGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.huanggai', label: '黄盖', sex: 'male', group: 'wu', hp: 4,
    abilities: ['standard.kurou'] } as const;
  readonly skills = [{ id: 'standard.kurou', label: '苦肉', active: {
    cost: 'loseHp', costs: () => [[]], targets: () => [[]],
    execute: (state, owner) => draw(state, owner, 2),
  } }] satisfies StandardGeneralModule['skills'];
}

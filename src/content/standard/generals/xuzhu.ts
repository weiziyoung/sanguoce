import { draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class XuZhuGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.xuzhu', label: '许褚', sex: 'male', group: 'wei', hp: 4,
    abilities: ['standard.luoyi'] } as const;
  readonly skills = [{ id: 'standard.luoyi', label: '裸衣', drawPhase: {
    options: () => [{ id: 'luoyi', label: '少摸一张牌，本回合杀和决斗伤害+1', targets: [] }],
    execute: (state, owner) => {
      draw(state, owner, 1);
      state.turnMarks ??= [];
      state.turnMarks.push({ owner, ability: 'standard.luoyi', turn: state.turn });
    },
  }, modifier: {
    damageAmount: (state, owner, _target, card, current) => {
      if (!state.turnMarks?.some(mark => mark.owner === owner && mark.ability === 'standard.luoyi' && mark.turn === state.turn) ||
        state.active !== owner || card === null) return current;
      const name = typeof card === 'number' ? state.cards[card]?.name : card.name;
      return name === 'sha' || name === 'juedou' ? current + 1 : current;
    },
  } }] satisfies StandardGeneralModule['skills'];
}

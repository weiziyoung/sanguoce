import { takeRandomHand } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class ZhangLiaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.zhangliao', label: '张辽', sex: 'male', group: 'wei', hp: 4,
    abilities: ['standard.tuxi'] } as const;
  readonly skills = [{ id: 'standard.tuxi', label: '突袭', drawPhase: {
    options: (state, owner) => {
      const candidates = state.players.filter(player => player.alive && player.id !== owner && player.hand.length)
        .map(player => player.id);
      return candidates.flatMap((first, index) => [
        { id: `${first}`, label: `获得${state.players[first].label}的一张手牌`, targets: [first] },
        ...candidates.slice(index + 1).map(second => ({ id: `${first}:${second}`,
          label: `各获得${state.players[first].label}、${state.players[second].label}的一张手牌`,
          targets: [first, second] })),
      ]);
    },
    execute: (state, owner, targets) => {
      for (const target of targets) takeRandomHand(state, target, owner, 'gain');
    },
  } }] satisfies StandardGeneralModule['skills'];
}

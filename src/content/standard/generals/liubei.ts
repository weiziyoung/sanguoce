import { emitEvent } from '../../../domain/event-journal.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class LiuBeiGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.liubei', label: '刘备', sex: 'male', group: 'shu', hp: 4,
    abilities: ['standard.rende', 'standard.jijiang'] } as const;
  readonly skills = [
    { id: 'standard.rende', label: '仁德', active: {
      cost: 'transfer', selection: { min: 1, selectable: (state, owner) => state.players[owner].hand },
      targets: (state, owner) => state.players.filter(player => player.alive && player.id !== owner)
        .map(player => [player.id]),
      execute: (state, owner, ids, targets) => {
        const recipient = targets[0];
        cardMovement.move(state, ids, { kind: 'hand', owner: recipient }, owner);
        for (const card of ids) emitEvent(state, 'gained', { from: owner, to: recipient, card, hidden: true, cause: 'standard.rende' });
        state.skillProgress ??= [];
        let progress = state.skillProgress.find(item => item.owner === owner && item.ability === 'standard.rende' &&
          item.turn === state.turn);
        if (!progress) {
          progress = { owner, ability: 'standard.rende', turn: state.turn, count: 0 };
          state.skillProgress.push(progress);
        }
        const before = progress.count;
        progress.count += ids.length;
        if (before < 2 && progress.count >= 2) vitals.recover(state, owner);
      },
    } },
    { id: 'standard.jijiang', label: '激将', lordSkill: true,
      proxyResponse: { produces: 'sha', group: 'shu' } },
  ] satisfies StandardGeneralModule['skills'];
}

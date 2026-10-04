import { draw } from '../../../rules/operations/cards.ts';
import { promptResponse } from '../flows/response-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class DiaoChanGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.diaochan', label: '貂蝉', sex: 'female', group: 'qun', hp: 3,
    abilities: ['standard.lijian', 'standard.biyue'] } as const;
  readonly skills = [
    { id: 'standard.lijian', label: '离间', active: {
      limit: 'oncePerTurn', cost: 'discardOwned',
      costs: (state, owner) => [...state.players[owner].hand,
        ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null)].map(id => [id]),
      targets: (state, owner) => {
        const men = state.players.filter(player => player.alive && player.id !== owner && player.sex === 'male');
        return men.flatMap(initiator => men.filter(target => target.id !== initiator.id)
          .map(target => [initiator.id, target.id]));
      },
      execute: (state, _owner, _costs, [initiator, target]) => {
        // The first man initiates the virtual Duel; the second must respond first.
        // Lijian has no nullification window.
        promptResponse(state, { mode: 'juedou', actor: target, source: initiator, cardName: 'juedou' });
      },
    } },
    { id: 'standard.biyue', label: '闭月', endPhase: { optional: false,
      available: (state, owner) => state.players[owner].alive,
      execute: (state, owner) => draw(state, owner, 1),
    } },
  ] satisfies StandardGeneralModule['skills'];
}

import { cardColor } from '../../../../catalog.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class ZhenJiGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.zhenji', label: '甄姬', sex: 'female', group: 'wei', hp: 3,
    abilities: ['standard.luoshen', 'standard.qingguo'] } as const;
  readonly skills = [
    { id: 'standard.luoshen', label: '洛神', startPhase: {
      available: (state, owner) => state.players[owner].alive,
      activate: (state, owner, runtime) => new JudgementFlow(runtime).begin(state, owner, 'standard.luoshen',
        { kind: 'applyStartSkillJudgement', ability: 'standard.luoshen', owner }, '洛神'),
      onJudgement: (state, owner, finalId) => {
        if (finalId === null || cardColor(state.cards[finalId]) !== 'black') return false;
        cardMovement.move(state, [finalId], { kind: 'hand', owner });
        emitEvent(state, 'gained', { from: owner, to: owner, card: finalId, hidden: false });
        return true;
      },
    } },
    { id: 'standard.qingguo', label: '倾国', transformation: {
      id: 'standard.qingguo', grantedBy: 'standard.qingguo', produces: 'shan',
      costs: (state, owner) => state.players[owner].hand
        .filter(id => cardColor(state.cards[id]) === 'black' && state.cards[id].name !== 'shan').map(id => [id]),
    } },
  ] satisfies StandardGeneralModule['skills'];
}

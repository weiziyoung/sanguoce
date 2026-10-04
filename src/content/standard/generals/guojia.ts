import { emitEvent } from '../../../domain/event-journal.ts';
import { DistributionFlow } from '../../../rules/flows/distribution-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class GuoJiaGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.guojia', label: '郭嘉', sex: 'male', group: 'wei', hp: 3,
    abilities: ['standard.tiandu', 'standard.yiji'] } as const;
  readonly skills = [
    { id: 'standard.tiandu', label: '天妒', trigger: {
      id: 'standard.tiandu', label: '天妒', grantedBy: 'standard.tiandu',
      event: 'judgementApplied', priority: 5,
      owners: (_state, event) => [event.data.player],
      eligible: (state, event, owner) => event.data.player === owner && state.discard.includes(event.data.card),
      execute: (state, event, owner) => {
        cardMovement.move(state, [event.data.card], { kind: 'hand', owner });
        emitEvent(state, 'gained', { from: owner, to: owner, card: event.data.card, hidden: false });
      },
    } },
    { id: 'standard.yiji', label: '遗计', trigger: {
      id: 'standard.yiji', label: '遗计', grantedBy: 'standard.yiji',
      event: 'damageTaken', priority: 5, optional: true,
      owners: (_state, event) => [event.data.target],
      repeats: (_state, event) => event.data.amount,
      eligible: (state, event, owner) => event.data.target === owner && state.players[owner].alive,
      execute: (state, _event, owner) => new DistributionFlow().begin(state, owner, 'standard.yiji'),
    } },
  ] satisfies StandardGeneralModule['skills'];
}

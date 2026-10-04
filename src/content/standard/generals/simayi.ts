import { chooseZoneOptions } from '../flows/trick-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class SiMaYiGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.simayi', label: '司马懿', sex: 'male', group: 'wei', hp: 3,
    abilities: ['standard.fankui', 'standard.guicai'] } as const;
  readonly skills = [
    { id: 'standard.fankui', label: '反馈', trigger: {
      id: 'standard.fankui', label: '反馈', grantedBy: 'standard.fankui', event: 'damageTaken',
      priority: 10, optional: true,
      owners: (_state, event) => [event.data.target],
      eligible: (state, event, owner) => event.data.target === owner && event.data.source !== null &&
        event.data.source !== owner && state.players[event.data.source]?.alive === true &&
        (state.players[event.data.source].hand.length > 0 ||
          Object.values(state.players[event.data.source].equip).some(id => id !== null)),
      execute: (state, event, owner) => chooseZoneOptions(state, event.data.source!, {
        label: '反馈', gain: true, source: owner, target: event.data.source!, handAndEquipOnly: true,
      }),
    } },
    { id: 'standard.guicai', label: '鬼才', judgement: {
      cards: (state, owner) => state.players[owner].hand,
    } },
  ] satisfies StandardGeneralModule['skills'];
}

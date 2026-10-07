import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { chooseZoneOptions } from '../../standard/flows/trick-flow.ts';
export class PangDeGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.pangde', label: '庞德', sex: 'male', group: 'qun', hp: 4, abilities: ['fire.mashu', 'fire.mengjin'] } as const;
  readonly skills = [{ id: 'fire.mashu', label: '马术', modifier: { distance: (_s, owner, from, _to, n) => from === owner ? n - 1 : n } },
  { id: 'fire.mengjin', label: '猛进', trigger: {
    id: 'fire.mengjin', label: '猛进', grantedBy: 'fire.mengjin', event: 'attackMissed', priority: 5, optional: true,
    owners: (_s, event) => [event.data.source],
    eligible: (s, event, owner) => event.data.source === owner && s.players[event.data.target].alive &&
      (s.players[event.data.target].hand.length > 0 || Object.values(s.players[event.data.target].equip).some(id => id !== null)),
    execute: (s, event, owner) => chooseZoneOptions(s, event.data.target, { source: owner, target: event.data.target, label: '猛进', gain: false, handAndEquipOnly: true }),
  } }] satisfies StandardGeneralModule['skills'];
}

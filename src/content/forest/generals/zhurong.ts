import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { PindianFlow } from '../../../rules/flows/pindian-flow.ts';
import { chooseZoneOptions } from '../../standard/flows/trick-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
export class ZhuRongGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.zhurong', label: '祝融', sex: 'female', group: 'shu', hp: 4,
    abilities: ['forest.juxiang', 'forest.lieren'] } as const;
  readonly skills = [{ id: 'forest.juxiang', label: '巨象', modifier: { trickEffective: (_s, _owner, card) => card !== 'nanman' },
    cardFinished: (s, owner, card, source) => {
      if (s.cards[card].name === 'nanman' && source !== owner && s.table.includes(card)) {
        emitEvent(s, 'skillActivated', { ability: 'forest.juxiang', label: '巨象', owner, targets: [] });
        cardMovement.move(s, [card], { kind: 'hand', owner });
        emitEvent(s, 'gained', { from: source, to: owner, card, hidden: false, cause: 'forest.juxiang' });
      }
    },
  }, { id: 'forest.lieren', label: '烈刃', trigger: {
    id: 'forest.lieren', label: '烈刃', grantedBy: 'forest.lieren', event: 'damageTaken', priority: 5, optional: true,
    owners: (_s, event) => event.data.source === null ? [] : [event.data.source],
    eligible: (s, event, owner) => event.data.source === owner && owner !== event.data.target && s.players[owner].alive &&
      s.players[event.data.target].alive && s.players[owner].hand.length > 0 && s.players[event.data.target].hand.length > 0 &&
      (typeof event.data.card === 'number' ? s.cards[event.data.card]?.name : event.data.card?.name) === 'sha',
    execute: (s, event, owner, runtime) => new PindianFlow(runtime!).begin(s, owner, event.data.target, 'forest.lieren'),
  }, callback: (s, owner, context) => {
    const target = context.target!;
    if (context.won && s.players[owner].alive && s.players[target].alive &&
      (s.players[target].hand.length || Object.values(s.players[target].equip).some(id => id !== null)))
      chooseZoneOptions(s, target, { source: owner, target, label: '烈刃', gain: true, handAndEquipOnly: true });
  } }] satisfies StandardGeneralModule['skills'];
}

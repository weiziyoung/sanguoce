import { emitEvent } from '../../../domain/event-journal.ts';
import { draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class CaoRenGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.caoren', label: '曹仁', sex: 'male', group: 'wei', hp: 4, abilities: ['wind.jushou'] } as const;
  readonly skills = [{ id: 'wind.jushou', label: '据守', endPhase: {
    available: () => true,
    execute: (s, owner) => {
      draw(s, owner, 3); s.players[owner].faceDown = !s.players[owner].faceDown;
      emitEvent(s, 'turnedOver', { player: owner, faceDown: Boolean(s.players[owner].faceDown) });
    },
  } }] satisfies StandardGeneralModule['skills'];
}

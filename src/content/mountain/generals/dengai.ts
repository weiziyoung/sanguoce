import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { awaken, awakened, grant } from '../helpers.ts';
export class DengAiGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.dengai', label: '邓艾', sex: 'male', group: 'wei', hp: 4, abilities: ['mountain.tuntian', 'mountain.zaoxian'] } as const;
  readonly skills = [{ id: 'mountain.tuntian', label: '屯田', trigger: {
    id: 'mountain.tuntian', label: '屯田', grantedBy: 'mountain.tuntian', event: 'cardsLost', priority: 3, optional: true,
    owners: (_s, e) => [e.data.player], eligible: (s, e, owner) => owner !== s.active && e.data.player === owner && !!(e.data.hand.length + e.data.equip.length),
    execute: (s, _e, owner, runtime) => new JudgementFlow(runtime!).begin(s, owner, 'mountain.tuntian',
      { kind: 'contentCallback', ability: 'mountain.tuntian', owner, context: { timing: 'judged' } }, '屯田'),
  }, callback: (s, owner, _ctx, runtime) => {
    const id = resolutionStack.require(s, 'judgement').data.finalId;
    if (id !== null && s.discard.includes(id) && runtime.queries.suit(s, owner, s.cards[id]) !== 'heart') {
      cardMovement.move(s, [id], { kind: 'pile', owner, ability: 'mountain.tuntian' });
      emitEvent(s, 'pileChanged', { player: owner, ability: 'mountain.tuntian', cards: s.players[owner].piles!['mountain.tuntian'] });
    }
  }, modifier: { distance: (s, owner, from, _to, current) => from === owner ? current - (s.players[owner].piles?.['mountain.tuntian']?.length ?? 0) : current } },
  { id: 'mountain.zaoxian', label: '凿险', startPhase: { optional: false,
    available: (s, owner) => !awakened(s, owner, 'mountain.zaoxian') && s.players[owner].maxHp > 1 && (s.players[owner].piles?.['mountain.tuntian']?.length ?? 0) >= 3,
    activate: (s, owner) => { awaken(s, owner, 'mountain.zaoxian'); grant(s, owner, ['mountain.jixi']); },
  } }, { id: 'mountain.jixi', label: '急袭', transformation: { id: 'mountain.jixi', grantedBy: 'mountain.jixi', produces: 'shunshou',
    allowedPiles: ['mountain.tuntian'], preserveSuit: true, costs: (s, owner) => (s.players[owner].piles?.['mountain.tuntian'] ?? []).map(id => [id]),
  } }] satisfies StandardGeneralModule['skills'];
}

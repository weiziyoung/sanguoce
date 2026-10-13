import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { deckService } from '../../../rules/operations/deck-service.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
export class MengHuoGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.menghuo', label: '孟获', sex: 'male', group: 'shu', hp: 4,
    abilities: ['forest.huoshou', 'forest.zaiqi'] } as const;
  readonly skills = [{ id: 'forest.huoshou', label: '祸首', modifier: {
    trickEffective: (_s, _owner, card) => card !== 'nanman',
    damageSource: (_s, owner, source, card) => card?.name === 'nanman' ? owner : source,
  } }, { id: 'forest.zaiqi', label: '再起', drawPhase: {
    options: (s, owner) => s.players[owner].hp < s.players[owner].maxHp ? [{ id: 'reveal', label: '亮出已损失体力数的牌，红桃回血，其余获得', targets: [] }] : [],
    execute: (s, owner, _targets, runtime) => {
      const cards = deckService.takeTop(s, s.players[owner].maxHp - s.players[owner].hp, { kind: 'table' });
      for (const card of cards) {
        emitEvent(s, 'cardRevealed', { player: owner, card, cause: 'forest.zaiqi' });
        const heart = runtime.queries.suit(s, owner, s.cards[card]) === 'heart';
        cardMovement.move(s, [card], heart ? { kind: 'discard' } : { kind: 'hand', owner });
        if (heart) vitals.recover(s, owner);
        else emitEvent(s, 'gained', { from: owner, to: owner, card, hidden: false, cause: 'forest.zaiqi' });
      }
    },
  } }] satisfies StandardGeneralModule['skills'];
}

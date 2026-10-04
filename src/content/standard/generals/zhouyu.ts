import { emitEvent } from '../../../domain/event-journal.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { random } from '../../../rules/operations/random.ts';
import { damage } from '../flows/damage-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

const suits = [
  { id: 'spade', label: '黑桃' }, { id: 'club', label: '梅花' },
  { id: 'heart', label: '红桃' }, { id: 'diamond', label: '方片' },
] as const;

export class ZhouYuGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.zhouyu', label: '周瑜', sex: 'male', group: 'wu', hp: 3,
    abilities: ['standard.yingzi', 'standard.fanjian'] } as const;
  readonly skills = [
    { id: 'standard.yingzi', label: '英姿', drawPhase: {
      optional: false,
      options: () => [{ id: 'extra', label: '额外摸一张牌', targets: [] }],
      execute: (state, owner) => draw(state, owner, 3),
    } },
    { id: 'standard.fanjian', label: '反间', active: {
      limit: 'oncePerTurn', cost: 'none',
      costs: (state, owner) => state.players[owner].hand.length ? [[]] : [],
      targets: (state, owner) => state.players.filter(player => player.alive && player.id !== owner)
        .map(player => [player.id]),
      followup: {
        actor: (_state, _owner, targets) => targets[0],
        options: () => suits,
        execute: (state, owner, targets, choice) => {
          const target = targets[0];
          const hand = state.players[owner].hand;
          if (!hand.length || !suits.some(suit => suit.id === choice)) throw new Error('反间牌或花色已失效');
          const id = hand[Math.floor(random(state) * hand.length)];
          cardMovement.move(state, [id], { kind: 'hand', owner: target }, owner);
          // The received suit is compared publicly for this skill.
          emitEvent(state, 'gained', { from: owner, to: target, card: id, hidden: false });
          if (state.cards[id].suit !== choice) damage(state, target, owner, 1, null, id);
        },
      },
    } },
  ] satisfies StandardGeneralModule['skills'];
}

import { cardText } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { deckService } from '../../../rules/operations/deck-service.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { discardOwned } from '../../../rules/operations/cards.ts';
import { gain, owned, reoffer } from '../helpers.ts';
export class MaSuGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.masu', label: '马谡', sex: 'male', group: 'shu', hp: 3, abilities: ['yijiang2011.xinzhan', 'yijiang2011.huilei'] } as const;
  readonly skills = [{ id: 'yijiang2011.xinzhan', label: '心战', active: { limit: 'oncePerTurn', cost: 'none', costs: (s, owner) => s.players[owner].hand.length > s.players[owner].maxHp ? [[]] : [], targets: () => [[]],
    execute: (s, owner) => { const ids = deckService.takeTop(s, 3, { kind: 'table' }); openContentChoice(s, owner, 'yijiang2011.xinzhan', { timing: 'gain', privateCards: ids, remaining: ids, selectedIds: [] }); },
  }, choice: { silent: true, options: (s, _owner, ctx) => ctx.timing === 'gain' ? [
    ...(ctx.remaining ?? []).filter(id => s.cards[id].suit === 'heart').map(id => ({ id: `gain:${id}`, ids: [id], label: `展示并获得${cardText(s.cards[id])}` })), { id: 'order', label: '将其余牌按顺序放回牌堆顶' },
  ] : (ctx.remaining ?? []).map(id => ({ id: `top:${id}`, ids: [id], label: `${cardText(s.cards[id])}排在下一张` })),
    execute: (s, owner, ctx, a) => {
      if (a.choice === 'order') ctx.timing = 'order';
      else { const id = a.ids[0]; ctx.remaining = ctx.remaining!.filter(n => n !== id);
        if (ctx.timing === 'gain') { cardMovement.move(s, [id], { kind: 'hand', owner }); gain(s, owner, [id], 'yijiang2011.xinzhan'); }
        else ctx.selectedIds!.push(id);
      }
      if (ctx.timing === 'order' && !ctx.remaining!.length) { cardMovement.move(s, [...ctx.selectedIds!].reverse(), { kind: 'deck' }); return; }
      reoffer(s);
    },
  } }, { id: 'yijiang2011.huilei', label: '挥泪', onKilled: (s, _owner, source) => { if (source !== null && s.players[source].alive) for (const id of owned(s, source)) discardOwned(s, source, id); } }] satisfies StandardGeneralModule['skills'];
}

import { cardText, cardTypeOf } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { discardOwned } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import type { EquipSlot } from '../../../domain/state.ts';
import { pass } from '../helpers.ts';
export class WuGuoTaiGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.wuguotai', label: '吴国太', sex: 'female', group: 'wu', hp: 3, abilities: ['yijiang2011.ganlu', 'yijiang2011.buyi'] } as const;
  readonly skills = [{ id: 'yijiang2011.ganlu', label: '甘露', active: { limit: 'oncePerTurn', cost: 'none', costs: () => [[]],
    targets: (s, owner) => s.players.filter(p => p.alive).flatMap(a => s.players.filter(b => b.alive && b.id > a.id &&
      Math.abs(Object.values(a.equip).filter(id => id !== null).length - Object.values(b.equip).filter(id => id !== null).length) <= s.players[owner].maxHp - s.players[owner].hp).map(b => [a.id, b.id])),
    execute: (s, _owner, _ids, targets) => {
      const [a, b] = targets; const sets = [a, b].map(id => Object.entries(s.players[id].equip).filter((e): e is [EquipSlot, number] => e[1] !== null));
      for (const entries of sets) if (entries.length) cardMovement.move(s, entries.map(e => e[1]), { kind: 'table' });
      sets.forEach((entries, i) => { const owner = targets[1 - i]; for (const [slot, card] of entries) { cardMovement.move(s, [card], { kind: 'equip', owner, slot }); emitEvent(s, 'equipped', { player: owner, card, replaced: false }); } });
    },
  } }, { id: 'yijiang2011.buyi', label: '补益', events: ['dying'], onEvent: (s, owner, e) => {
    if (e.kind === 'dying' && s.players[e.data.target].hp <= 0 && s.players[e.data.target].hand.length) openContentChoice(s, owner, 'yijiang2011.buyi', { timing: 'reveal', target: e.data.target });
  }, choice: { options: (s, owner, ctx) => s.players[ctx.target!].hp > 0 ? [] : [
    ...s.players[ctx.target!].hand.map((id, slot) => ({ id: `hand:${slot}`, zone: 'hand' as const, slot, ...(ctx.target === owner ? { ids: [id] } : {}), label: ctx.target === owner ? `展示${cardText(s.cards[id])}` : `展示第${slot + 1}张手牌` })), pass],
    execute: (s, owner, ctx, a) => { if (a.type === 'pass') return; const target = ctx.target!, id = s.players[target].hand[Number(a.choice.split(':')[1])];
      emitEvent(s, 'cardRevealed', { player: target, card: id, cause: 'yijiang2011.buyi' });
      if (cardTypeOf(s.cards[id]) !== 'basic') { discardOwned(s, target, id); vitals.recover(s, target, 1, owner); }
    },
  } }] satisfies StandardGeneralModule['skills'];
}

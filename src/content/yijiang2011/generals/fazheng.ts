import { cardText } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { draw, takeOwned } from '../../../rules/operations/cards.ts';
import { loseHp, reoffer } from '../helpers.ts';
export class FaZhengGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.fazheng', label: '法正', sex: 'male', group: 'shu', hp: 3, abilities: ['yijiang2011.enyuan', 'yijiang2011.xuanhuo'] } as const;
  readonly skills = [{ id: 'yijiang2011.enyuan', label: '恩怨', events: ['recovered'], onEvent: (s, owner, e) => {
    if (e.kind === 'recovered' && e.data.player === owner && e.data.source !== undefined && e.data.source !== owner && s.players[e.data.source].alive) draw(s, e.data.source, e.data.amount);
  }, trigger: { id: 'yijiang2011.enyuan', event: 'damageTaken', priority: 0, grantedBy: 'yijiang2011.enyuan', owners: (_s, e) => [e.data.target],
    eligible: (s, e, owner) => e.data.source !== null && e.data.source !== owner && s.players[e.data.source].alive,
    execute: (s, e, owner) => openContentChoice(s, owner, 'yijiang2011.enyuan', { timing: 'pay', source: e.data.source }),
  }, choice: { actor: (_s, _owner, ctx) => ctx.source!,
    options: (s, _owner, ctx, rt) => [...s.players[ctx.source!].hand.filter(id => rt.queries.suit(s, ctx.source!, s.cards[id]) === 'heart').map(id => ({ id: `give:${id}`, ids: [id], label: `交出${cardText(s.cards[id])}` })), { id: 'lose', label: '失去1点体力' }],
    execute: (s, owner, ctx, a) => { if (a.choice === 'lose') loseHp(s, ctx.source!); else takeOwned(s, ctx.source!, owner, a.ids[0]); },
  } }, { id: 'yijiang2011.xuanhuo', label: '眩惑', active: { limit: 'oncePerTurn', cost: 'custom', costs: (s, owner) => s.players[owner].hand.filter(id => s.cards[id].suit === 'heart').map(id => [id]),
    targets: (s, owner) => s.players.filter(p => p.alive).length < 3 ? [] : s.players.filter(p => p.alive && p.id !== owner).map(p => [p.id]),
    execute: (s, owner, ids, targets) => { takeOwned(s, owner, targets[0], ids[0]); openContentChoice(s, owner, 'yijiang2011.xuanhuo', { timing: 'take', target: targets[0] }); },
  }, choice: { options: (s, owner, ctx) => {
    if (ctx.timing === 'give') return !s.players[owner].hand.includes(ctx.selectedIds![0]) ? [] : s.players.filter(p => p.alive && p.id !== owner && p.id !== ctx.target).map(p => ({ id: `give:${p.id}`, targets: [p.id], label: `交给${p.label}` }));
    const p = s.players[ctx.target!];
    return [...p.hand.map((_id, slot) => ({ id: `hand:${slot}`, zone: 'hand' as const, slot, label: `获得第${slot + 1}张手牌` })), ...Object.values(p.equip).filter((id): id is number => id !== null).map(id => ({ id: `equip:${id}`, ids: [id], label: `获得${cardText(s.cards[id])}` }))];
  }, execute: (s, owner, ctx, a) => {
    if (ctx.timing === 'give') { if (a.targets[0] !== owner) takeOwned(s, owner, a.targets[0], ctx.selectedIds![0]); return; }
    const id = a.choice.startsWith('hand:') ? s.players[ctx.target!].hand[Number(a.choice.split(':')[1])] : a.ids[0];
    takeOwned(s, ctx.target!, owner, id); ctx.selectedIds = [id]; ctx.timing = 'give'; reoffer(s);
  } } }] satisfies StandardGeneralModule['skills'];
}

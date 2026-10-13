import { cardText, cardType } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { gainPublic } from '../helpers.ts';
export class ZhangZhaoZhangHongGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.zhangzhaozhanghong', label: '张昭张纮', sex: 'male', group: 'wu', hp: 3, abilities: ['mountain.zhijian', 'mountain.guzheng'] } as const;
  readonly skills = [{ id: 'mountain.zhijian', label: '直谏', active: { cost: 'custom', costs: (s, owner) => s.players[owner].hand.filter(id => cardType(s.cards[id].name) === 'equip').map(id => [id]),
    targets: (s, owner, ids, runtime) => { const slot = runtime.content.card(s.cards[ids[0]].name).slot;
      return slot ? s.players.filter(p => p.alive && p.id !== owner && p.equip[slot] === null).map(p => [p.id]) : []; },
    execute: (s, owner, ids, targets, runtime) => { const slot = runtime.content.card(s.cards[ids[0]].name).slot!;
      cardMovement.move(s, ids, { kind: 'equip', owner: targets[0], slot }, owner); emitEvent(s, 'equipped', { player: targets[0], card: ids[0], replaced: false }); draw(s, owner, 1); },
  } }, { id: 'mountain.guzheng', label: '固政', phaseAfter: (s, owner) => {
    if (owner === s.active || !s.players[s.active].alive || s.skipDiscardPhase) return;
    const start = [...s.events].reverse().find(e => e.kind === 'discardPhaseStarted')?.id ?? s.events.length + 1;
    const events = s.events.filter(e => e.id > start);
    const discarded = events.filter(e => e.kind === 'discarded' && e.data.reason === 'discard').flatMap(e => e.kind === 'discarded' && s.discard.includes(e.data.card) ? [e.data.card] : []);
    const ownHand = events.filter(e => e.kind === 'cardsMoved').flatMap(e => e.kind === 'cardsMoved' ? e.data.moves.filter(m => m.from.kind === 'hand' && m.from.owner === s.active && m.to.kind === 'discard').map(m => m.card) : []);
    const returns = [...new Set(discarded.filter(id => ownHand.includes(id)))];
    if (returns.length) openContentChoice(s, owner, 'mountain.guzheng', { timing: 'return', target: s.active, selectedIds: returns, remaining: [...new Set(discarded)] });
  }, choice: { options: (s, _owner, ctx) => [...(ctx.selectedIds ?? []).filter(id => s.discard.includes(id)).map(id => ({ id: `return:${id}`, ids: [id], targets: [ctx.target!], label: `归还${cardText(s.cards[id])}，获得其余弃牌` })), { id: 'pass', label: '不发动固政', pass: true }],
    execute: (s, owner, ctx, a) => { if (a.type === 'pass') return; gainPublic(s, ctx.target!, a.ids, 'mountain.guzheng'); gainPublic(s, owner, (ctx.remaining ?? []).filter(id => id !== a.ids[0]), 'mountain.guzheng'); },
  } }] satisfies StandardGeneralModule['skills'];
}

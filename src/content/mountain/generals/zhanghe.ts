import { cardText } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { discardOwned, takeRandomHand } from '../../../rules/operations/cards.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { reoffer } from '../helpers.ts';
export class ZhangHeGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.zhanghe', label: '张郃', sex: 'male', group: 'wei', hp: 4, abilities: ['mountain.qiaobian'] } as const;
  readonly skills = [{ id: 'mountain.qiaobian', label: '巧变', phaseBefore: { phases: ['judge', 'draw', 'play', 'discard'], execute: (s, owner, phase) => {
    if (s.players[owner].hand.length && !(phase === 'draw' && s.skipDraw || phase === 'play' && s.skipPlay))
      openContentChoice(s, owner, 'mountain.qiaobian', { timing: 'cost', mode: phase });
  } }, choice: { silent: true,
    options: (s, owner, ctx, runtime) => {
      if (ctx.timing === 'cost') return [...s.players[owner].hand.map(id => ({ id: `cost:${id}`, ids: [id], label: `弃置${cardText(s.cards[id])}，跳过此阶段` })), { id: 'pass', label: '正常进行此阶段', pass: true }];
      if (ctx.timing === 'draw') return [...s.players.filter(p => p.alive && p.id !== owner && p.hand.length && !ctx.remaining?.includes(p.id))
        .map(p => ({ id: `hand:${p.id}`, targets: [p.id], label: `获得${p.label}一张手牌` })), { id: 'pass', label: '结束获得手牌', pass: true }];
      return [...s.players.filter(p => p.alive).flatMap(p => [...Object.values(p.equip).filter((id): id is number => id !== null), ...p.judge].flatMap(id => {
        const slot = runtime.content.card(s.cards[id].name).slot;
        const name = s.virtualJudgeNames?.find(v => v.card === id)?.name ?? s.cards[id].name;
        return s.players.filter(to => to.alive && to.id !== p.id && (slot ? to.equip[slot] === null : !to.judge.some(c => (s.virtualJudgeNames?.find(v => v.card === c)?.name ?? s.cards[c].name) === name)))
          .map(to => ({ id: `move:${id}:${p.id}:${to.id}`, ids: [id], targets: [p.id, to.id], label: `将${p.label}的${cardText(s.cards[id])}移给${to.label}` }));
      })), { id: 'pass', label: '不移动牌', pass: true }];
    },
    execute: (s, owner, ctx, a, runtime) => {
      if (a.type === 'pass') return;
      if (ctx.timing === 'cost') {
        discardOwned(s, owner, a.ids[0]);
        emitEvent(s, 'skillActivated', { ability: 'mountain.qiaobian', label: '巧变', owner, targets: [] });
        if (ctx.mode === 'judge') s.skipJudge = true;
        if (ctx.mode === 'draw') { s.skipDraw = true; ctx.timing = 'draw'; ctx.remaining = []; reoffer(s); }
        if (ctx.mode === 'play') { s.skipPlay = true; ctx.timing = 'move'; reoffer(s); }
        if (ctx.mode === 'discard') s.skipDiscardPhase = true;
      } else if (ctx.timing === 'draw') {
        takeRandomHand(s, a.targets[0], owner, 'gain'); ctx.remaining!.push(a.targets[0]);
        if (ctx.remaining!.length < 2) reoffer(s);
      } else {
        const [from, to] = a.targets, id = a.ids[0], slot = runtime.content.card(s.cards[id].name).slot;
        const virtual = s.virtualJudgeNames?.find(v => v.card === id);
        cardMovement.move(s, [id], slot ? { kind: 'equip', owner: to, slot } : { kind: 'judge', owner: to }, from);
        if (virtual) s.virtualJudgeNames!.push(virtual);
        if (slot) emitEvent(s, 'equipped', { player: to, card: id, replaced: false });
        else emitEvent(s, 'delayPlaced', { source: from, target: to, card: id, ...(virtual ? { effectiveName: virtual.name } : {}) });
      }
    },
  } }] satisfies StandardGeneralModule['skills'];
}

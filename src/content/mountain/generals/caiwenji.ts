import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { draw, discardOwned } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { owned, discardOptions, discardStep } from '../../forest/helpers.ts';
export class CaiWenJiGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.caiwenji', label: '蔡文姬', sex: 'female', group: 'qun', hp: 3, abilities: ['mountain.beige', 'mountain.duanchang'] } as const;
  readonly skills = [{ id: 'mountain.beige', label: '悲歌', trigger: { id: 'mountain.beige', label: '悲歌', grantedBy: 'mountain.beige', event: 'damageTaken', priority: 4, announce: false,
    owners: s => s.players.filter(p => p.alive).map(p => p.id), eligible: (s, e, owner) => !!owned(s, owner).length && s.players[e.data.target].alive && (typeof e.data.card === 'number' ? s.cards[e.data.card].name : e.data.card?.name) === 'sha',
    execute: (s, e, owner) => openContentChoice(s, owner, 'mountain.beige', { timing: 'cost', target: e.data.target, source: e.data.source }),
  }, choice: { silent: true, actor: (_s, owner, ctx) => ctx.timing === 'discard' ? ctx.target! : owner,
    options: (s, owner, ctx) => ctx.timing === 'discard' ? discardOptions(s, ctx.target!) : [...owned(s, owner).map(id => ({ id: `pay:${id}`, ids: [id], label: '弃置此牌发动悲歌' })), { id: 'pass', label: '不发动悲歌', pass: true }],
    execute: (s, owner, ctx, a, runtime) => { if (a.type === 'pass') return;
      if (ctx.timing === 'discard') { discardStep(s, ctx, a.ids[0]); return; }
      discardOwned(s, owner, a.ids[0]); emitEvent(s, 'skillActivated', { ability: 'mountain.beige', label: '悲歌', owner, targets: [ctx.target!] });
      new JudgementFlow(runtime).begin(s, ctx.target!, 'mountain.beige', { kind: 'contentCallback', ability: 'mountain.beige', owner, context: { ...ctx, timing: 'judged' } }, '悲歌');
    },
  }, callback: (s, owner, ctx, runtime) => {
    const id = resolutionStack.require(s, 'judgement').data.finalId; if (id === null || !s.players[ctx.target!].alive) return;
    const suit = runtime.queries.suit(s, ctx.target!, s.cards[id]);
    if (suit === 'heart') vitals.recover(s, ctx.target!);
    if (suit === 'diamond') draw(s, ctx.target!, 2);
    if (ctx.source === null || ctx.source === undefined || !s.players[ctx.source].alive) return;
    if (suit === 'spade') { const p = s.players[ctx.source]; p.faceDown = !p.faceDown; emitEvent(s, 'turnedOver', { player: p.id, faceDown: p.faceDown }); }
    if (suit === 'club' && owned(s, ctx.source).length) openContentChoice(s, owner, 'mountain.beige', { timing: 'discard', target: ctx.source, amount: 2 });
  } }, { id: 'mountain.duanchang', label: '断肠', onKilled: (s, owner, source, runtime) => {
    if (source === null || source === owner || !s.players[source].alive) return;
    const p = s.players[source]; p.generalSkillsDisabled = true;
    if (p.huashen) { const g = runtime.content.general(p.general!); p.sex = g.sex ?? 'male'; p.group = g.group; delete p.huashen; }
    emitEvent(s, 'skillActivated', { ability: 'mountain.duanchang', label: '断肠', owner, targets: [source] });
    emitEvent(s, 'skillsChanged', { player: source, gained: [], disabled: true });
  } }] satisfies StandardGeneralModule['skills'];
}

import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { cardType } from '../../../../catalog.ts';
import { discardOwned } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { awakened, grant, reoffer } from '../helpers.ts';
export class LiuShanGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.liushan', label: '刘禅', sex: 'male', group: 'shu', hp: 3, abilities: ['mountain.xiangle', 'mountain.fangquan', 'mountain.ruoyu'] } as const;
  readonly skills = [{ id: 'mountain.xiangle', label: '享乐', trigger: {
    id: 'mountain.xiangle', label: '享乐', grantedBy: 'mountain.xiangle', event: 'attackTargeted', priority: 20,
    owners: (_s, e) => [e.data.target], eligible: (_s, e, owner) => e.data.target === owner,
    execute: (s, e, owner) => openContentChoice(s, owner, 'mountain.xiangle', { timing: 'cost', source: e.data.source, attack: e.data }),
  }, choice: { silent: true, actor: (_s, _owner, ctx) => ctx.source!,
    options: (s, _owner, ctx) => [...s.players[ctx.source!].hand.filter(id => cardType(s.cards[id].name) === 'basic').map(id => ({ id: `pay:${id}`, ids: [id], label: '弃置一张基本牌，使杀正常结算' })),
      { id: 'pass', label: '不弃牌，此杀对刘禅无效', pass: true }],
    execute: (s, _owner, ctx, a) => { if (a.type === 'pass') resolutionStack.nearest(s, 'triggerWindow').data.cancelled = true;
      else discardOwned(s, ctx.source!, a.ids[0]); },
  } }, { id: 'mountain.fangquan', label: '放权', phaseBefore: { phases: ['play'], execute: (s, owner) => {
    if (!s.skipPlay && s.players.some(p => p.alive && p.id !== owner)) openContentChoice(s, owner, 'mountain.fangquan', { timing: 'skip' });
  } },
    endPhase: { available: (s, owner) => !!s.players[owner].hand.length && !!s.turnMarks?.some(m => m.owner === owner && m.ability === 'mountain.fangquan' && m.turn === s.turn),
      execute: (s, owner) => openContentChoice(s, owner, 'mountain.fangquan', { timing: 'cost' }) },
    choice: { silent: true, options: (s, owner, ctx) => ctx.timing === 'skip' ? [{ id: 'skip', label: '跳过出牌阶段，结束时可交给其他角色额外回合' }, { id: 'pass', label: '正常出牌', pass: true }] :
      ctx.timing === 'cost' ? s.players[owner].hand.map(id => ({ id: `discard:${id}`, ids: [id], label: '弃置此手牌' })) :
        s.players.filter(p => p.alive && p.id !== owner).map(p => ({ id: `target:${p.id}`, targets: [p.id], label: `令${p.label}进行额外回合` })),
      execute: (s, owner, ctx, a) => { if (a.type === 'pass') return;
        if (ctx.timing === 'skip') { s.skipPlay = true; s.turnMarks ??= []; s.turnMarks.push({ owner, ability: 'mountain.fangquan', turn: s.turn }); }
        else if (ctx.timing === 'cost') { discardOwned(s, owner, a.ids[0]); ctx.timing = 'target'; reoffer(s); }
        else { s.extraTurns ??= []; s.extraTurns.push(a.targets[0]); }
      },
    },
  }, { id: 'mountain.ruoyu', label: '若愚', lordSkill: true, startPhase: { optional: false,
    available: (s, owner) => s.mode.id === 'identity' && s.mode.roles[owner] === 'lord' && !awakened(s, owner, 'mountain.ruoyu') && s.players.every(p => !p.alive || p.hp >= s.players[owner].hp),
    activate: (s, owner) => { const p = s.players[owner]; p.skillFlags ??= {}; p.skillFlags['mountain.ruoyu.awakened'] = true;
      emitEvent(s, 'awakened', { player: owner, ability: 'mountain.ruoyu' }); vitals.gainMaxHp(s, owner, 1); vitals.recover(s, owner); grant(s, owner, ['standard.jijiang']); },
  } }] satisfies StandardGeneralModule['skills'];
}

import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import type { SkillDefinition } from '../../../rules/content-registry.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { PindianFlow } from '../../../rules/flows/pindian-flow.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { SunJianGeneral } from '../../forest/generals/sunjian.ts';
import { awaken, awakened, grant, gainPublic } from '../helpers.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
const soul = new SunJianGeneral().skills[0];
const zhibaLord = (s: import('../../../domain/state.ts').ReadonlyGameState, runtime: import('../../../rules/content-runtime.ts').ContentRuntime) =>
  s.players.find(p => p.alive && s.mode.id === 'identity' && s.mode.roles[p.id] === 'lord' && runtime.abilities.has(s, p.id, 'mountain.zhiba'));
export class SunCeGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.sunce', label: '孙策', sex: 'male', group: 'wu', hp: 4, abilities: ['mountain.jiang', 'mountain.hunzi', 'mountain.zhiba'] } as const;
  readonly skills = [{ id: 'mountain.jiang', label: '激昂', trigger: { id: 'mountain.jiang', label: '激昂', grantedBy: 'mountain.jiang', event: 'cardUsed', priority: 5, optional: true,
    owners: (_s, e) => [...new Set([e.data.source, ...e.data.targets])], eligible: (s, e, owner) => (e.data.effectiveName ?? s.cards[e.data.card]?.name) === 'juedou' && (owner === e.data.source || e.data.targets.includes(owner)),
    execute: (s, _e, owner) => draw(s, owner, 1),
  } }, { id: 'mountain.jiang.sha', label: '激昂', grantedTo: (s, owner) => !s.players[owner].generalSkillsDisabled && (s.players[owner].general === 'mountain.sunce' || s.players[owner].gainedAbilities?.includes('mountain.jiang') === true),
    trigger: { id: 'mountain.jiang.sha', label: '激昂', grantedBy: 'mountain.jiang', event: 'attackUsed', priority: 5, optional: true,
      owners: (_s, e) => [...new Set([e.data.source, ...e.data.targets])], eligible: (_s, e) => cardColor(e.data.card) === 'red', execute: (s, _e, owner) => draw(s, owner, 1) } },
  { id: 'mountain.hunzi', label: '魂姿', startPhase: { optional: false,
    available: (s, owner) => s.players[owner].hp === 1 && s.players[owner].maxHp > 1 && !awakened(s, owner, 'mountain.hunzi'),
    activate: (s, owner) => { awaken(s, owner, 'mountain.hunzi'); grant(s, owner, ['standard.yingzi', 'mountain.yinghun']);
      resolutionStack.enqueue(s, { kind: 'phaseStartOffer', owner, ability: 'mountain.yinghun' }); },
  } }, { ...soul, id: 'mountain.yinghun', startPhase: { ...soul.startPhase, activate: (s, owner) => openContentChoice(s, owner, 'mountain.yinghun', { timing: 'target', amount: s.players[owner].maxHp - s.players[owner].hp }) } }, { id: 'mountain.zhiba', label: '制霸', lordSkill: true }] satisfies StandardGeneralModule['skills'];
}
export const zhibaOffer: SkillDefinition = { id: 'mountain.zhiba.offer', label: '制霸', grantedTo: (s, owner) =>
  s.mode.id === 'identity' && s.players[owner].group === 'wu' && s.players.some(p => p.id !== owner && p.alive && s.mode.roles[p.id] === 'lord' && !p.generalSkillsDisabled && (p.general === 'mountain.sunce' || p.gainedAbilities?.includes('mountain.zhiba'))),
  active: { cost: 'none', limit: 'oncePerTurn', costs: (s, owner) => s.players[owner].hand.length ? [[]] : [],
    targets: (s, owner, _ids, runtime) => { const lord = zhibaLord(s, runtime); return lord && lord.id !== owner && lord.hand.length ? [[lord.id]] : []; },
    execute: (s, owner, _ids, targets, runtime) => { if (awakened(s, targets[0], 'mountain.hunzi')) openContentChoice(s, owner, 'mountain.zhiba.offer', { timing: 'ask', source: owner, target: targets[0] });
      else new PindianFlow(runtime).begin(s, owner, targets[0], 'mountain.zhiba.offer'); },
  }, choice: { silent: true, actor: (_s, _owner, ctx) => ctx.target!, options: (_s, _owner, ctx) => ctx.timing === 'loot' ? [{ id: 'gain', label: '获得两张拼点牌' }, { id: 'pass', label: '不获得', pass: true }] : [{ id: 'accept', label: '接受制霸拼点' }, { id: 'pass', label: '拒绝拼点', pass: true }],
    execute: (s, owner, ctx, a, runtime) => { if (a.type !== 'pass') { if (ctx.timing === 'loot') gainPublic(s, ctx.target!, ctx.selectedIds ?? [], 'mountain.zhiba'); else new PindianFlow(runtime).begin(s, owner, ctx.target!, 'mountain.zhiba.offer'); } },
  }, callback: (s, _owner, ctx) => { if (!ctx.won && s.players[ctx.target!].alive && !s.players[ctx.target!].generalSkillsDisabled) openContentChoice(s, _owner, 'mountain.zhiba.offer', { ...ctx, timing: 'loot' }); } };

import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { damage } from '../../../rules/flows/damage-flow.ts';
import { pass } from '../helpers.ts';
export class LingTongGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.lingtong', label: '凌统', sex: 'male', group: 'wu', hp: 4, abilities: ['yijiang2011.xuanfeng'] } as const;
  readonly skills = [{ id: 'yijiang2011.xuanfeng', label: '旋风', trigger: { id: 'yijiang2011.xuanfeng', event: 'cardsLost', priority: 0, grantedBy: 'yijiang2011.xuanfeng',
    owners: (_s, e) => [e.data.player], eligible: (_s, e) => e.data.equip.length > 0,
    execute: (s, _e, owner) => openContentChoice(s, owner, 'yijiang2011.xuanfeng', { timing: 'effect' }),
  }, choice: { options: (s, owner, _ctx, rt) => [...s.players.filter(p => p.alive && p.id !== owner).flatMap(p => [
    ...(rt.queries.canSha(s, owner, p.id, true) ? [{ id: `sha:${p.id}`, targets: [p.id], label: `视为对${p.label}使用杀` }] : []),
    ...(rt.queries.distance(s, owner, p.id) <= 1 ? [{ id: `damage:${p.id}`, targets: [p.id], label: `对${p.label}造成1点伤害` }] : []),
  ]), pass], execute: (s, owner, _ctx, a, rt) => { if (a.type === 'pass') return; if (a.choice.startsWith('damage')) damage(s, a.targets[0], owner); else beginAttackUse(s, owner, { name: 'sha', suit: null, virtual: true }, a.targets, rt, { ignoreDistance: true }); },
  } }] satisfies StandardGeneralModule['skills'];
}

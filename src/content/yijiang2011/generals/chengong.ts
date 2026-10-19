import { cardTypeOf, cardType } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { draw, takeOwned } from '../../../rules/operations/cards.ts';
import { owned, reoffer } from '../helpers.ts';
export class ChenGongGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.chengong', label: '陈宫', sex: 'male', group: 'qun', hp: 3, abilities: ['yijiang2011.mingce', 'yijiang2011.zhichi'] } as const;
  readonly skills = [{ id: 'yijiang2011.mingce', label: '明策', active: { limit: 'oncePerTurn', cost: 'custom', costs: (s, owner) => owned(s, owner).filter(id => s.cards[id].name === 'sha' || cardTypeOf(s.cards[id]) === 'equip').map(id => [id]),
    targets: (s, owner) => s.players.filter(p => p.alive && p.id !== owner).map(p => [p.id]),
    execute: (s, owner, ids, targets) => { takeOwned(s, owner, targets[0], ids[0]); openContentChoice(s, owner, 'yijiang2011.mingce', { timing: 'target', target: targets[0] }); },
  }, choice: { actor: (_s, owner, ctx) => ctx.timing === 'effect' ? ctx.target! : owner,
    options: (s, _owner, ctx, rt) => ctx.timing === 'target' ? [...s.players.filter(p => rt.queries.canSha(s, ctx.target!, p.id)).map(p => ({ id: `target:${p.id}`, targets: [p.id], label: `指定${p.label}为杀的目标` })), ...(!s.players.some(p => rt.queries.canSha(s, ctx.target!, p.id)) ? [{ id: 'draw', label: '令其摸一张牌' }] : [])] : [
      ...(ctx.source !== null && ctx.source !== undefined && rt.queries.canSha(s, ctx.target!, ctx.source) ? [{ id: 'sha', targets: [ctx.source], label: '视为对指定角色使用杀' }] : []), { id: 'draw', label: '摸一张牌' },
    ], execute: (s, _owner, ctx, a, rt) => { if (a.choice === 'draw') { draw(s, ctx.target!, 1); return; }
      if (ctx.timing === 'target') { ctx.source = a.targets[0]; ctx.timing = 'effect'; reoffer(s); }
      else beginAttackUse(s, ctx.target!, { name: 'sha', suit: null, virtual: true }, [ctx.source!], rt);
    },
  } }, { id: 'yijiang2011.zhichi', label: '智迟', trigger: { id: 'yijiang2011.zhichi', event: 'damageTaken', priority: 10, grantedBy: 'yijiang2011.zhichi', owners: (_s, e) => [e.data.target], eligible: (s, _e, owner) => s.active !== owner,
    execute: (s, _e, owner) => { (s.players[owner].skillState ??= {})['yijiang2011.zhichi'] = { turn: s.turn }; },
  }, modifier: { attackEffective: (s, owner) => s.players[owner].skillState?.['yijiang2011.zhichi']?.turn !== s.turn,
    trickEffective: (s, owner, card, _source, target) => target !== owner || cardType(card) !== 'trick' || s.players[owner].skillState?.['yijiang2011.zhichi']?.turn !== s.turn,
  } }] satisfies StandardGeneralModule['skills'];
}

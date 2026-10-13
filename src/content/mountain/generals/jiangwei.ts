import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { spendSha } from '../../../rules/card-costs.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { awaken, awakened, grant } from '../helpers.ts';
import { chooseZoneOptions } from '../../standard/flows/trick-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
export class JiangWeiGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.jiangwei', label: '姜维', sex: 'male', group: 'shu', hp: 4, abilities: ['mountain.tiaoxin', 'mountain.zhiji'] } as const;
  readonly skills = [{ id: 'mountain.tiaoxin', label: '挑衅', active: { cost: 'none', limit: 'oncePerTurn', costs: () => [[]],
    targets: (s, owner, _costs, runtime) => s.players.filter(p => p.alive && p.id !== owner &&
      runtime.queries.distance(s, p.id, owner) <= runtime.queries.attackRange(s, p.id)).map(p => [p.id]),
    execute: (s, owner, _costs, targets) => openContentChoice(s, owner, 'mountain.tiaoxin', { timing: 'sha', target: targets[0] }),
  }, choice: { silent: true, actor: (_s, _owner, ctx) => ctx.target!,
    options: (s, owner, ctx, runtime) => [
      ...runtime.transforms.candidates(s, ctx.target!, 'sha').filter(c => runtime.queries.canSha(s, ctx.target!, owner) &&
        runtime.queries.canTarget(s, ctx.target!, owner, 'sha', false, c.effective)).map(c => ({ id: `sha:${c.transformation ?? 'physical'}:${c.ids.join(',')}`, ids: c.ids, targets: [owner], label: '对挑衅者使用杀' })),
      { id: 'pass', label: '不出杀，允许挑衅者弃置一张牌', pass: true }],
    execute: (s, owner, ctx, action, runtime) => {
      if (action.type === 'pass') { if (!s.players[ctx.target!].hand.length && !Object.values(s.players[ctx.target!].equip).some(id => id !== null)) return; chooseZoneOptions(s, ctx.target!, { source: owner, target: ctx.target!, label: '挑衅：弃置目标的一张牌', handAndEquipOnly: true }); return; }
      const c = runtime.transforms.candidates(s, ctx.target!, 'sha').find(c => `sha:${c.transformation ?? 'physical'}:${c.ids.join(',')}` === action.choice)!;
      const card = spendSha(s, ctx.target!, c.ids, 'use', runtime, c.transformation);
      if (c.transformation) emitEvent(s, 'transformationUsed', { ability: c.transformation, label: runtime.content.skillForTransformation(c.transformation).label!, owner: ctx.target!, produces: 'sha' });
      beginAttackUse(s, ctx.target!, card, [owner], runtime, { forcedBy: owner });
    },
  } }, { id: 'mountain.zhiji', label: '志继', startPhase: { optional: false,
    available: (s, owner) => !awakened(s, owner, 'mountain.zhiji') && !s.players[owner].hand.length && s.players[owner].maxHp > 1,
    activate: (s, owner) => openContentChoice(s, owner, 'mountain.zhiji', { timing: 'reward' }),
  }, choice: { silent: true, options: (s, owner) => [{ id: 'draw', label: '摸两张牌' },
      ...(s.players[owner].hp < s.players[owner].maxHp ? [{ id: 'recover', label: '回复1点体力' }] : [])],
    execute: (s, owner, _ctx, a) => { if (a.choice === 'recover') vitals.recover(s, owner); else draw(s, owner, 2);
      awaken(s, owner, 'mountain.zhiji'); grant(s, owner, ['standard.guanxing']);
      resolutionStack.enqueue(s, { kind: 'phaseStartOffer', owner, ability: 'standard.guanxing' });
    },
  } }] satisfies StandardGeneralModule['skills'];
}

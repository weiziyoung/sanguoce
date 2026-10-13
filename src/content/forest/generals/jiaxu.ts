import { emitEvent } from '../../../domain/event-journal.ts';
import { cardColor, cardType } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { seatOrder } from '../../../domain/state-access.ts';
import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { spendSha } from '../../standard/transforms.ts';
import { loseLife } from '../helpers.ts';
export class JiaXuGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.jiaxu', label: '贾诩', sex: 'male', group: 'qun', hp: 3,
    abilities: ['forest.wansha', 'forest.luanwu', 'forest.weimu'] } as const;
  readonly skills = [{ id: 'forest.wansha', label: '完杀', modifier: {
    rescueEnabled: (s, owner, rescuer, _victim) => rescuer === owner || s.players[rescuer].hp <= 0,
  } }, { id: 'forest.weimu', label: '帷幕', modifier: {
    targetEnabled: (_s, _owner, _source, _target, name, effective) =>
      !effective || !['trick', 'delay'].includes(cardType(name)) || cardColor(effective) !== 'black',
  } }, { id: 'forest.luanwu', label: '乱武', active: { cost: 'none',
    costs: (s, owner) => s.players[owner].skillFlags?.['forest.luanwu.used'] ? [] : [[]], targets: () => [[]],
    execute: (s, owner) => {
      s.players[owner].skillFlags ??= {}; s.players[owner].skillFlags!['forest.luanwu.used'] = true;
      openContentChoice(s, owner, 'forest.luanwu', { timing: 'chaos', remaining: seatOrder(s, owner).filter(id => id !== owner) });
    },
  }, choice: { silent: true, ownerRequired: false, actor: (_s, owner, context) => context.remaining?.[0] ?? owner,
    options: (s, _owner, context, runtime) => {
      const actor = context.remaining?.[0]; if (actor === undefined || !s.players[actor].alive) return [];
      const others = s.players.filter(p => p.alive && p.id !== actor);
      const min = Math.min(...others.map(p => runtime.queries.distance(s, actor, p.id)));
      const targets = others.filter(p => runtime.queries.distance(s, actor, p.id) === min && runtime.queries.canSha(s, actor, p.id));
      return [...runtime.transforms.candidates(s, actor, 'sha').flatMap(cost => targets.map(p => ({
        id: `sha:${cost.transformation ?? 'physical'}:${cost.ids.join(',')}:${p.id}`, ids: cost.ids, targets: [p.id], label: `对最近的${p.label}使用杀`,
      }))), { id: 'loseHp', label: '不出杀，失去1点体力' }];
    },
    execute: (s, owner, context, action, runtime) => {
      const actor = context.remaining!.shift()!;
      context.remaining = context.remaining!.filter(id => s.players[id].alive);
      // Resume this effect after the attack and its damage/death children finish.
      if (context.remaining.length) resolutionStack.enqueue(s, { kind: 'contentCallback', ability: 'forest.luanwu', owner, context });
      if (action.choice === 'loseHp') loseLife(s, actor);
      else {
        const cost = runtime.transforms.candidates(s, actor, 'sha').find(cost =>
          `sha:${cost.transformation ?? 'physical'}:${cost.ids.join(',')}:${action.targets[0]}` === action.choice)!;
        const card = spendSha(s, actor, cost.ids, 'use', runtime, cost.transformation);
        if (cost.transformation) emitEvent(s, 'transformationUsed', { ability: cost.transformation, label: runtime.content.skillForTransformation(cost.transformation).label ?? cost.transformation, owner: actor, produces: 'sha' });
        beginAttackUse(s, actor, card, action.targets, runtime, { forcedBy: owner });
      }
    },
  }, callback: (s, owner, context) => {
    context.remaining = context.remaining?.filter(id => s.players[id].alive);
    if (context.remaining?.length) openContentChoice(s, owner, 'forest.luanwu', context);
  } }] satisfies StandardGeneralModule['skills'];
}

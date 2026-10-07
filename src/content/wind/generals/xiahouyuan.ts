import { cardTypeOf } from '../../../../catalog.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { beginAttackUse } from '../../../rules/flows/attack-use-flow.ts';
import { discardOwned } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class XiaHouYuanGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.xiahouyuan', label: '夏侯渊', sex: 'male', group: 'wei', hp: 4, abilities: ['wind.shensu'] } as const;
  readonly skills = [{ id: 'wind.shensu', label: '神速', phaseBefore: {
    phases: ['judge', 'play'], execute: (s, owner, phase) => {
      if (phase === 'play' && s.skipPlay) return;
      openContentChoice(s, owner, 'wind.shensu', { timing: phase });
    },
  }, choice: {
    options: (s, owner, context, runtime) => {
      const targets = s.players.filter(p => runtime.queries.canSha(s, owner, p.id, true));
      const costs = context.timing === 'judge' ? [[]] :
        [...s.players[owner].hand, ...Object.values(s.players[owner].equip).filter((id): id is number => id !== null)]
          .filter(id => cardTypeOf(s.cards[id]) === 'equip').map(id => [id]);
      return [...costs.flatMap(ids => targets.map(p => ({ id: `${ids.join(':')}:${p.id}`, ids, targets: [p.id],
        label: `${context.timing === 'judge' ? '跳过判定和摸牌' : '弃置装备并跳过出牌'}，对${p.label}使用杀` }))),
      { id: 'pass', label: '不发动', pass: true }];
    },
    execute: (s, owner, context, action, runtime) => {
      if (action.type === 'pass') return;
      if (context.timing === 'judge') { s.skipJudge = true; s.skipDraw = true; }
      else { for (const id of action.ids ?? []) discardOwned(s, owner, id); s.skipPlay = true; }
      beginAttackUse(s, owner, { name: 'sha', suit: null, virtual: true }, action.targets ?? [], runtime, { ignoreDistance: true });
    },
  } }] satisfies StandardGeneralModule['skills'];
}

import { cardColor } from '../../../../catalog.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { damage } from '../../../rules/flows/damage-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import type { SkillDefinition } from '../../../rules/content-registry.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class ZhangJiaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.zhangjiao', label: '张角', sex: 'male', group: 'qun', hp: 3,
    abilities: ['wind.leiji', 'wind.guidao', 'wind.huangtian'] } as const;
  readonly skills = [{ id: 'wind.leiji', label: '雷击', responseUsed: (s, owner, name) => {
    if (name === 'shan') openContentChoice(s, owner, 'wind.leiji', { timing: 'target' });
  }, choice: {
    options: (s) => [...s.players.filter(p => p.alive).map(p => ({ id: `target:${p.id}`, targets: [p.id], label: `令${p.label}判定，黑桃则受到2点雷电伤害` })),
      { id: 'pass', label: '不发动', pass: true }],
    execute: (s, owner, _context, action, runtime) => {
      if (action.type === 'pass') return;
      const target = action.targets![0];
      new JudgementFlow(runtime).begin(s, target, 'wind.leiji',
        { kind: 'contentCallback', ability: 'wind.leiji', owner, context: { timing: 'judgement', target } }, '雷击');
    },
  }, callback: (s, owner, context, runtime) => {
    const final = resolutionStack.require(s, 'judgement').data.finalId;
    if (final !== null && s.players[owner].alive && s.players[context.target!].alive &&
      runtime.queries.suit(s, context.target!, s.cards[final]) === 'spade')
      damage(s, context.target!, owner, 2, null, null, { nature: 'thunder' });
  } }, { id: 'wind.guidao', label: '鬼道', judgement: {
    allowEquipment: true, gainReplaced: true,
    cards: (s, owner) => [...s.players[owner].hand, ...Object.values(s.players[owner].equip).filter((id): id is number => id !== null)]
      .filter(id => cardColor(s.cards[id]) === 'black'),
  } }, { id: 'wind.huangtian', label: '黄天', lordSkill: true }] satisfies StandardGeneralModule['skills'];
}
export const huangtianGift: SkillDefinition = {
  id: 'wind.huangtian.gift', label: '黄天献牌',
  grantedTo: (s, owner) => s.mode.id === 'identity' && s.players[owner].group === 'qun' &&
    s.players.some(p => p.alive && p.id !== owner && s.mode.roles[p.id] === 'lord' && p.general === 'wind.zhangjiao'),
  active: { limit: 'oncePerTurn', cost: 'transfer',
    costs: (s, owner) => s.players[owner].hand.filter(id => ['shan', 'shandian'].includes(s.cards[id].name)).map(id => [id]),
    targets: s => s.players.filter(p => p.alive && s.mode.roles[p.id] === 'lord' && p.general === 'wind.zhangjiao').map(p => [p.id]),
    execute: (s, owner, ids, targets) => {
      cardMovement.move(s, ids, { kind: 'hand', owner: targets[0] }, owner);
      for (const card of ids) emitEvent(s, 'gained', { from: owner, to: targets[0], card, hidden: false, cause: 'wind.huangtian' });
    },
  },
};

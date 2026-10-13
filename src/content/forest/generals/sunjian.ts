import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { discardOptions, discardStep } from '../helpers.ts';
export class SunJianGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.sunjian', label: '孙坚', sex: 'male', group: 'wu', hp: 4, abilities: ['forest.yinghun'] } as const;
  readonly skills = [{ id: 'forest.yinghun', label: '英魂', startPhase: {
    available: (s, owner) => s.players[owner].hp < s.players[owner].maxHp && s.players.some(p => p.alive && p.id !== owner),
    activate: (s, owner) => openContentChoice(s, owner, 'forest.yinghun', { timing: 'target', amount: s.players[owner].maxHp - s.players[owner].hp }),
  }, choice: { silent: true,
    actor: (_s, owner, context) => context.timing === 'discard' ? context.target! : owner,
    options: (s, owner, context) => context.timing === 'discard' ? discardOptions(s, context.target!) :
      s.players.filter(p => p.alive && p.id !== owner).flatMap(p => [
        { id: `help:${p.id}`, targets: [p.id], label: `${p.label}摸${context.amount}张、弃1张` },
        { id: `hurt:${p.id}`, targets: [p.id], label: `${p.label}摸1张、弃${context.amount}张` },
      ]),
    execute: (s, _owner, context, action) => {
      if (context.timing === 'discard') { discardStep(s, context, action.ids[0]); return; }
      context.target = action.targets[0];
      const help = action.choice.startsWith('help:');
      draw(s, context.target, help ? context.amount! : 1);
      context.amount = help ? 1 : context.amount;
      context.timing = 'discard';
      resolutionStack.enqueue(s, { kind: 'contentChoiceOffer' });
    },
  } }] satisfies StandardGeneralModule['skills'];
}

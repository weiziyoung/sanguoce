import { cardText } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { give, owned } from '../helpers.ts';
export class LuSuGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.lusu', label: '鲁肃', sex: 'male', group: 'wu', hp: 3, abilities: ['forest.haoshi', 'forest.dimeng'] } as const;
  readonly skills = [{ id: 'forest.haoshi', label: '好施', drawPhase: {
    options: () => [{ id: 'draw', label: '额外摸两张，超过五张时交出一半手牌', targets: [] }],
    execute: (s, owner) => {
      draw(s, owner, 4);
      if (s.players[owner].hand.length > 5 && s.players.some(p => p.alive && p.id !== owner))
        openContentChoice(s, owner, 'forest.haoshi', { timing: 'cards', amount: Math.floor(s.players[owner].hand.length / 2), selectedIds: [] });
    },
  }, choice: { silent: true,
    options: (s, owner, context) => {
      if (context.timing === 'cards') return s.players[owner].hand.filter(id => !context.selectedIds!.includes(id))
        .map(id => ({ id: `card:${id}`, ids: [id], label: `选择赠出${cardText(s.cards[id])}` }));
      const others = s.players.filter(p => p.alive && p.id !== owner);
      const minimum = Math.min(...others.map(p => p.hand.length));
      return others.filter(p => p.hand.length === minimum).map(p => ({ id: `recipient:${p.id}`, targets: [p.id], label: `将所选一半手牌交给${p.label}` }));
    },
    execute: (s, owner, context, action) => {
      if (context.timing === 'cards') {
        context.selectedIds!.push(action.ids[0]);
        if (context.selectedIds!.length === context.amount) context.timing = 'recipient';
        resolutionStack.enqueue(s, { kind: 'contentChoiceOffer' });
      } else give(s, owner, action.targets[0], context.selectedIds!, 'forest.haoshi');
    },
  } }, { id: 'forest.dimeng', label: '缔盟', active: { limit: 'oncePerTurn', cost: 'discardOwned',
    available: (s, owner) => {
      const others = s.players.filter(p => p.alive && p.id !== owner);
      return others.some((a, i) => others.slice(i + 1).some(b => Math.abs(a.hand.length - b.hand.length) <= owned(s, owner).length));
    },
    selection: { min: 0, selectable: owned },
    targets: (s, owner, ids) => {
      const others = s.players.filter(p => p.alive && p.id !== owner);
      return others.flatMap((a, i) => others.slice(i + 1).filter(b => Math.abs(a.hand.length - b.hand.length) === ids.length).map(b => [a.id, b.id]));
    },
    execute: (s, _owner, _ids, targets) => {
      const [a, b] = targets;
      const first = [...s.players[a].hand], second = [...s.players[b].hand];
      give(s, a, b, first, 'forest.dimeng');
      give(s, b, a, second, 'forest.dimeng');
    },
  } }] satisfies StandardGeneralModule['skills'];
}

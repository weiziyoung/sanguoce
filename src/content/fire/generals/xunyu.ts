import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { PindianFlow } from '../../../rules/flows/pindian-flow.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { damage } from '../../../rules/flows/damage-flow.ts';
import { draw } from '../../../rules/operations/cards.ts';
export class XunYuGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.xunyu', label: '荀彧', sex: 'male', group: 'wei', hp: 3, abilities: ['fire.quhu', 'fire.jieming'] } as const;
  readonly skills = [{ id: 'fire.quhu', label: '驱虎', active: { limit: 'oncePerTurn', cost: 'none',
    costs: (s, owner) => s.players[owner].hand.length ? [[]] : [],
    targets: (s, owner) => s.players.filter(p => p.alive && p.id !== owner && p.hp > s.players[owner].hp && p.hand.length).map(p => [p.id]),
    execute: (s, owner, _ids, targets, runtime) => new PindianFlow(runtime).begin(s, owner, targets[0], 'fire.quhu'),
  }, callback: (s, owner, context) => {
    if (context.won) openContentChoice(s, owner, 'fire.quhu', { timing: 'victim', target: context.target });
    else if (s.players[owner].alive && s.players[context.target!].alive) damage(s, owner, context.target!, 1, null, null, { forcedBy: owner });
  }, choice: {
    options: (s, _owner, context, runtime) => s.players.filter(p => p.alive && p.id !== context.target &&
      runtime.queries.distance(s, context.target!, p.id) <= runtime.queries.attackRange(s, context.target!))
      .map(p => ({ id: `victim:${p.id}`, targets: [p.id], label: `令${s.players[context.target!].label}对${p.label}造成1点伤害` })),
    execute: (s, owner, context, action) => damage(s, action.targets[0], context.target!, 1, null, null, { forcedBy: owner }),
  } }, { id: 'fire.jieming', label: '节命', trigger: {
    id: 'fire.jieming', label: '节命', grantedBy: 'fire.jieming', event: 'damageTaken', priority: 5, optional: true,
    owners: (_s, event) => [event.data.target], repeats: (_s, event) => event.data.amount,
    eligible: (s, event, owner) => event.data.target === owner && s.players[owner].alive,
    execute: (s, _event, owner) => openContentChoice(s, owner, 'fire.jieming', { timing: 'target' }),
  }, choice: {
    options: s => s.players.filter(p => p.alive).map(p => ({ id: `target:${p.id}`, targets: [p.id], label: `令${p.label}补牌至${Math.min(5, p.maxHp)}张` })),
    execute: (s, _owner, _context, action) => { const p = s.players[action.targets[0]]; draw(s, p.id, Math.max(0, Math.min(5, p.maxHp) - p.hand.length)); },
  } }] satisfies StandardGeneralModule['skills'];
}

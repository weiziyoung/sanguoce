import { equipSlot, cardTypeOf } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { damage } from '../../../rules/flows/damage-flow.ts';
import { discardOwned } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { beginDying } from '../../../rules/flows/dying-flow.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
export class DianWeiGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.dianwei', label: '典韦', sex: 'male', group: 'wei', hp: 4, abilities: ['fire.qiangxi'] } as const;
  readonly skills = [{ id: 'fire.qiangxi', label: '强袭', active: { limit: 'oncePerTurn', cost: 'custom',
    costs: (s, owner) => [[], ...[...s.players[owner].hand, s.players[owner].equip.weapon].filter((id): id is number => id !== null)
      .filter(id => cardTypeOf(s.cards[id]) === 'equip' && equipSlot(s.cards[id].name) === 'weapon').map(id => [id])],
    targets: (s, owner, ids, runtime) => s.players.filter(p => p.alive && p.id !== owner &&
      runtime.queries.distance(s, owner, p.id) <= (ids.includes(s.players[owner].equip.weapon ?? -1) ? 1 : runtime.queries.attackRange(s, owner))).map(p => [p.id]),
    execute: (s, owner, ids, targets, runtime) => {
      if (ids.length) discardOwned(s, owner, ids[0]);
      else { vitals.loseHp(s, owner, 1); emitEvent(s, 'hpLost', { player: owner, amount: 1 }); }
      resolutionStack.enqueue(s, { kind: 'contentCallback', ability: 'fire.qiangxi', owner, context: { timing: 'damage', target: targets[0] } });
      if (s.players[owner].hp <= 0) beginDying(s, owner);
    },
  }, callback: (s, owner, context) => { if (s.players[context.target!].alive) damage(s, context.target!, owner, 1); } }] satisfies StandardGeneralModule['skills'];
}

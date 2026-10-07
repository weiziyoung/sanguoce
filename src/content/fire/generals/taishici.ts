import type { ReadonlyGameState } from '../../../domain/state.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { PindianFlow } from '../../../rules/flows/pindian-flow.ts';
const active = (s: ReadonlyGameState, owner: number) => s.active === owner && s.phase === 'play' && s.skillUses?.some(u => u.owner === owner && u.ability === 'fire.tianyi' && u.turn === s.turn);
export class TaiShiCiGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.taishici', label: '太史慈', sex: 'male', group: 'wu', hp: 4, abilities: ['fire.tianyi'] } as const;
  readonly skills = [{ id: 'fire.tianyi', label: '天义', active: { limit: 'oncePerTurn', cost: 'none',
    costs: (s, owner) => s.players[owner].hand.length ? [[]] : [],
    targets: (s, owner) => s.players.filter(p => p.alive && p.id !== owner && p.hand.length).map(p => [p.id]),
    execute: (s, owner, _ids, targets, runtime) => new PindianFlow(runtime).begin(s, owner, targets[0], 'fire.tianyi'),
  }, callback: (s, owner, context) => { s.players[owner].skillFlags ??= {}; s.players[owner].skillFlags['fire.tianyi.win'] = Boolean(context.won); },
  modifier: {
    attackRange: (s, owner, n) => active(s, owner) && s.players[owner].skillFlags?.['fire.tianyi.win'] ? Infinity : n,
    shaLimit: (s, owner, n) => active(s, owner) ? s.players[owner].skillFlags?.['fire.tianyi.win'] ? n + 1 : 0 : n,
    shaTargets: (s, owner, n) => active(s, owner) && s.players[owner].skillFlags?.['fire.tianyi.win'] ? n + 1 : n,
  } }] satisfies StandardGeneralModule['skills'];
}

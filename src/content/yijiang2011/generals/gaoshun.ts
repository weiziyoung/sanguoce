import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import type { ReadonlyGameState } from '../../../domain/state.ts';
import { PindianFlow } from '../../../rules/flows/pindian-flow.ts';
const result = (s: ReadonlyGameState, owner: number) => { const r = s.players[owner].skillState?.['yijiang2011.xianzhen']; return r?.turn === s.turn ? r : undefined; };
export class GaoShunGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.gaoshun', label: '高顺', sex: 'male', group: 'qun', hp: 4, abilities: ['yijiang2011.xianzhen', 'yijiang2011.jinjiu'] } as const;
  readonly skills = [{ id: 'yijiang2011.xianzhen', label: '陷阵', active: { limit: 'oncePerTurn', cost: 'none', costs: (s, owner) => s.players[owner].hand.length ? [[]] : [],
    targets: (s, owner) => s.players.filter(p => p.alive && p.id !== owner && p.hand.length).map(p => [p.id]),
    execute: (s, owner, _ids, targets, rt) => new PindianFlow(rt).begin(s, owner, targets[0], 'yijiang2011.xianzhen'),
  }, callback: (s, owner, ctx) => { (s.players[owner].skillState ??= {})['yijiang2011.xianzhen'] = { turn: s.turn, won: !!ctx.won, target: ctx.target }; },
    modifier: { shaUseEnabled: (s, owner) => result(s, owner)?.won !== false, shaLimit: (s, owner, n) => result(s, owner)?.won === false ? 0 : n,
      shaTargetLimit: (s, owner, target, n) => result(s, owner)?.won && result(s, owner)?.target === target ? Infinity : n,
      distance: (s, owner, from, to, n) => from === owner && result(s, owner)?.won && result(s, owner)?.target === to ? 1 : n,
      ignoresArmor: (s, owner, target) => !!result(s, owner)?.won && result(s, owner)?.target === target,
    },
  }, { id: 'yijiang2011.jinjiu', label: '禁酒', modifier: { cardName: (_s, _owner, card) => card.name === 'jiu' ? 'sha' : card.name } }] satisfies StandardGeneralModule['skills'];
}

import type { AttackContext, ReadonlyGameState } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { AttackRedirectFlow } from '../../../rules/flows/attack-redirect-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

const costs = (state: ReadonlyGameState, owner: number) => [
  ...state.players[owner].hand,
  ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null),
];
const targets = (state: ReadonlyGameState, owner: number, attack: AttackContext, runtime: ContentRuntime) =>
  state.players.filter(player => player.alive && player.id !== owner && player.id !== attack.source &&
    runtime.queries.distance(state, owner, player.id) <= runtime.queries.attackRange(state, owner) &&
    runtime.queries.canSha(state, attack.source, player.id, attack.ignoreDistance)).map(player => player.id);

export class DaQiaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.daqiao', label: '大乔', sex: 'female', group: 'wu', hp: 3,
    abilities: ['standard.guose', 'standard.liuli'] } as const;
  readonly skills = [
    { id: 'standard.guose', label: '国色', transformation: {
      id: 'standard.guose', grantedBy: 'standard.guose', produces: 'lebu',
      allowedZones: ['hand', 'equip'],
      costs: (state, owner) => costs(state, owner).filter(id => state.cards[id].suit === 'diamond').map(id => [id]),
    } },
    { id: 'standard.liuli', label: '流离', attackRedirect: { costs, targets }, trigger: {
      id: 'standard.liuli', label: '流离', grantedBy: 'standard.liuli',
      event: 'attackTargeted', priority: 50,
      owners: (_state, event) => [event.data.target],
      eligible: (state, event, owner, _abilities, runtime) => event.data.target === owner &&
        costs(state, owner).length > 0 && !!runtime && targets(state, owner, event.data, runtime).length > 0,
      execute: (state, event, owner, runtime) => {
        if (!runtime) throw new Error('流离缺少内容运行时');
        new AttackRedirectFlow(runtime).offer(state, event.data, owner, 'standard.liuli');
      },
    } },
  ] satisfies StandardGeneralModule['skills'];
}

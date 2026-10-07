import { resolutionStack } from '../../../domain/resolution-stack.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class HuangZhongGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.huangzhong', label: '黄忠', sex: 'male', group: 'shu', hp: 4, abilities: ['wind.liegong'] } as const;
  readonly skills = [{ id: 'wind.liegong', label: '烈弓', trigger: {
    id: 'wind.liegong', label: '烈弓', grantedBy: 'wind.liegong', event: 'attackTargeted', priority: 6, optional: true,
    owners: (_s, e) => [e.data.source],
    eligible: (s, e, owner, _abilities, runtime) => owner === e.data.source && s.active === owner && s.phase === 'play' &&
      (s.players[e.data.target].hand.length >= s.players[owner].hp ||
        s.players[e.data.target].hand.length <= (runtime?.queries.attackRange(s, owner) ?? 1)),
    execute: (s, e) => { resolutionStack.nearest(s, 'triggerWindow').data.then = [{ ...e.data, kind: 'shaHit' }]; },
  } }] satisfies StandardGeneralModule['skills'];
}

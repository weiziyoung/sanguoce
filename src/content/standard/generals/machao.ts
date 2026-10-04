import { cardColor } from '../../../../catalog.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class MaChaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.machao', label: '马超', sex: 'male', group: 'shu', hp: 4,
    abilities: ['standard.mashu', 'standard.tieji'] } as const;
  readonly skills = [
    { id: 'standard.mashu', label: '马术', modifier: {
      distance: (_state, owner, from, _to, current) => owner === from ? current - 1 : current,
    } },
    { id: 'standard.tieji', label: '铁骑', trigger: {
      id: 'standard.tieji', label: '铁骑', grantedBy: 'standard.tieji', event: 'attackTargeted',
      priority: 5, optional: true,
      owners: (_state, event) => [event.data.source],
      eligible: (state, event, owner) => event.data.source === owner && state.players[event.data.target].alive,
      execute: (state, event, owner, runtime) => {
        if (!runtime) throw new Error('铁骑缺少内容运行时');
        new JudgementFlow(runtime).begin(state, owner, 'standard.tieji', {
          kind: 'applyAttackJudgement', ability: 'standard.tieji', source: owner,
          target: event.data.target, sha: event.data.sha,
        }, '铁骑');
      },
    }, attackJudgement: {
      bypassResponse: (state, _owner, finalId) => finalId !== null && cardColor(state.cards[finalId]) === 'red',
    } },
  ] satisfies StandardGeneralModule['skills'];
}

import { draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class HuangYueYingGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.huangyueying', label: '黄月英', sex: 'female', group: 'shu', hp: 3,
    abilities: ['standard.jizhi', 'standard.qicai'] } as const;
  readonly skills = [
    { id: 'standard.jizhi', label: '集智', trigger: {
      id: 'standard.jizhi', label: '集智', grantedBy: 'standard.jizhi', event: 'cardUsed', priority: 10,
      owners: (_state, event) => [event.data.source],
      eligible: (state, event, owner, _abilities, runtime) => event.data.source === owner &&
        runtime?.content.card(event.data.effectiveName ?? state.cards[event.data.card].name).kind === 'trick',
      execute: (state, _event, owner) => draw(state, owner, 1),
    } },
    { id: 'standard.qicai', label: '奇才', modifier: {
      trickDistanceLimit: () => Infinity,
    } },
  ] satisfies StandardGeneralModule['skills'];
}

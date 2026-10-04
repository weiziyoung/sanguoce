import type { StandardGeneralModule } from './general-module.ts';

export class ZhaoYunGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.zhaoyun', label: '赵云', sex: 'male', group: 'shu', hp: 4,
    abilities: ['standard.longdan'] } as const;
  readonly skills = [{ id: 'standard.longdan', label: '龙胆', transformations: [
    { id: 'standard.longdan.sha', grantedBy: 'standard.longdan', produces: 'sha',
      costs: (state, owner) => state.players[owner].hand.filter(id => state.cards[id].name === 'shan').map(id => [id]) },
    { id: 'standard.longdan.shan', grantedBy: 'standard.longdan', produces: 'shan',
      costs: (state, owner) => state.players[owner].hand.filter(id => state.cards[id].name === 'sha').map(id => [id]) },
  ] }] satisfies StandardGeneralModule['skills'];
}

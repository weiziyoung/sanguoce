import type { ContentPack } from '../../rules/content-registry.ts';
import { draw } from '../../rules/operations/cards.ts';
import { vitals } from '../../rules/operations/vitals-service.ts';

/** First skill samples. These are deliberately not advertised as complete generals. */
export const pilotSkillPack: ContentPack = {
  id: 'pilot-skills', cards: [], deck: [],
  generals: [
    { id: 'pilot.huatuo', label: '华佗（青囊样本）', abilities: ['pilot.qingnang'] },
    { id: 'pilot.zhaoyun', label: '赵云（龙胆样本）', abilities: ['pilot.longdan'] },
    { id: 'pilot.huangyueying', label: '黄月英（集智样本）', abilities: ['pilot.jizhi'] },
    { id: 'pilot.sunquan', label: '孙权（制衡样本）', abilities: ['pilot.zhiheng'] },
    { id: 'pilot.simayi', label: '司马懿（鬼才样本）', abilities: ['pilot.guicai'] },
  ],
  skills: [
    { id: 'pilot.qingnang', label: '青囊', active: {
      limit: 'oncePerTurn', cost: 'discardOwned',
      costs: (state, owner) => state.players[owner].hand.map(id => [id]),
      targets: state => state.players.filter(player => player.alive && player.hp < player.maxHp).map(player => [player.id]),
      execute: (state, owner, _costs, targets) => vitals.recover(state, targets[0], 1, owner),
    } },
    { id: 'pilot.zhiheng', label: '制衡', active: {
      limit: 'oncePerTurn', cost: 'discardOwned',
      selection: { min: 1, selectable: (state, owner) => [
        ...state.players[owner].hand,
        ...Object.values(state.players[owner].equip).filter((id): id is number => id !== null),
      ] },
      targets: () => [[]],
      execute: (state, owner, costs) => draw(state, owner, costs.length),
    } },
    { id: 'pilot.longdan', label: '龙胆', transformations: [
      { id: 'pilot.longdan.sha', grantedBy: 'pilot.longdan', produces: 'sha',
        costs: (state, owner) => state.players[owner].hand.filter(id => state.cards[id].name === 'shan').map(id => [id]) },
      { id: 'pilot.longdan.shan', grantedBy: 'pilot.longdan', produces: 'shan',
        costs: (state, owner) => state.players[owner].hand.filter(id => state.cards[id].name === 'sha').map(id => [id]) },
    ] },
    { id: 'pilot.jizhi', label: '集智', trigger: {
      id: 'pilot.jizhi', label: '集智', grantedBy: 'pilot.jizhi', event: 'cardUsed', priority: 10, optional: true,
      owners: (_state, event) => [event.data.source],
      eligible: (state, event, owner, _abilities, runtime) => event.data.source === owner &&
        runtime?.content.card(state.cards[event.data.card].name).kind === 'trick',
      execute: (state, _event, owner) => draw(state, owner, 1),
    } },
    { id: 'pilot.guicai', label: '鬼才', judgement: {
      cards: (state, owner) => state.players[owner].hand,
    } },
  ],
};

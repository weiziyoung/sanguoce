import { draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class LuXunGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.luxun', label: '陆逊', sex: 'male', group: 'wu', hp: 3,
    abilities: ['standard.qianxun', 'standard.lianying'] } as const;
  readonly skills = [
    { id: 'standard.qianxun', label: '谦逊', modifier: {
      targetEnabled: (_state, owner, _source, target, card) => owner !== target ||
        (card !== 'shunshou' && card !== 'lebu'),
    } },
    { id: 'standard.lianying', label: '连营', trigger: {
      id: 'standard.lianying', label: '连营', grantedBy: 'standard.lianying',
      event: 'cardsLost', priority: 5, optional: false,
      owners: (_state, event) => [event.data.player],
      eligible: (state, event, owner) => event.data.player === owner && event.data.hand.length > 0 &&
        state.players[owner].hand.length === 0,
      execute: (state, _event, owner) => draw(state, owner, 1),
    } },
  ] satisfies StandardGeneralModule['skills'];
}

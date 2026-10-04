import { draw } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import type { StandardGeneralModule } from './general-module.ts';
import type { ReadonlyGameState } from '../../../domain/state.ts';

function jieyinTargets(state: ReadonlyGameState, owner: number): number[][] {
  return state.players.filter(player => player.alive && player.id !== owner &&
    player.sex === 'male' && player.hp < player.maxHp).map(player => [player.id]);
}

export class SunShangXiangGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.sunshangxiang', label: '孙尚香', sex: 'female', group: 'wu', hp: 3,
    abilities: ['standard.xiaoji', 'standard.jieyin'] } as const;
  readonly skills = [
    { id: 'standard.xiaoji', label: '枭姬', trigger: {
      id: 'standard.xiaoji', label: '枭姬', grantedBy: 'standard.xiaoji',
      event: 'cardsLost', priority: 5, optional: true,
      owners: (_state, event) => [event.data.player],
      repeats: (_state, event) => event.data.equip.length,
      eligible: (state, event, owner) => event.data.player === owner && event.data.equip.length > 0 &&
        state.players[owner].alive,
      execute: (state, _event, owner) => draw(state, owner, 2),
    } },
    { id: 'standard.jieyin', label: '结姻', active: {
      limit: 'oncePerTurn', cost: 'discardOwned',
      selection: { min: 2, max: 2, selectable: (state, owner) =>
        jieyinTargets(state, owner).length ? state.players[owner].hand : [] },
      targets: jieyinTargets,
      execute: (state, owner, _ids, [target]) => {
        vitals.recover(state, owner);
        vitals.recover(state, target, 1, owner);
      },
    } },
  ] satisfies StandardGeneralModule['skills'];
}

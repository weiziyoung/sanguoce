import { DeckReorderFlow } from '../../../rules/flows/deck-reorder-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class ZhuGeLiangGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.zhugeliang', label: '诸葛亮', sex: 'male', group: 'shu', hp: 3,
    abilities: ['standard.guanxing', 'standard.kongcheng'] } as const;
  readonly skills = [
    { id: 'standard.guanxing', label: '观星', startPhase: {
      available: state => state.deck.length + state.discard.length > 0,
      activate: (state, owner) => new DeckReorderFlow().begin(state, owner, 'standard.guanxing',
        Math.min(5, state.players.filter(player => player.alive).length)),
    } },
    { id: 'standard.kongcheng', label: '空城', modifier: {
      targetEnabled: (state, owner, _source, target, card) => !(owner === target &&
        state.players[owner].hand.length === 0 && (card === 'sha' || card === 'juedou')),
    } },
  ] satisfies StandardGeneralModule['skills'];
}

import type { Card } from '../../catalog.ts';
import type { GameConfig } from '../../contracts.ts';
import type { GeneralCandidate } from './duel-general-selector.ts';
import { DuelGeneralSelector, shuffleGenerals } from './duel-general-selector.ts';
import { contentForCards } from './game-content.ts';
import { createOpeningState } from './standard-game.ts';

export interface OpeningOptions { pointGeneral?: boolean; redraw?: boolean; }

export function pointCandidates(config: GameConfig): GeneralCandidate[] {
  const content = contentForCards(config.cards, config.generalPacks);
  const selector = new DuelGeneralSelector(content.generals(), content);
  return content.generals().map(general => selector.describe(general, config.mode === 'identity' ? 'identity' : 'duel'));
}

/** Resolve specified generals without duplicates, keeping unaffected computer picks stable. */
export function openingGenerals(config: GameConfig, candidates: readonly GeneralCandidate[], picks: readonly GeneralCandidate[],
  seat: number, generalId: string, options: OpeningOptions): GeneralCandidate[] {
  const available = pointCandidates(config);
  const player = (options.pointGeneral ? available : candidates).find(general => general.id === generalId);
  if (!player) throw new Error('武将不在本局候选中');
  const result = [...picks]; result[seat] = player;
  const used = new Set(result.map(general => general.id));
  for (let index = 0; index < result.length; index++) {
    if (index === seat || result[index].id !== player.id) continue;
    const replacement = shuffleGenerals(available, (config.seed ?? 1) ^ (index + 1)).find(general => !used.has(general.id));
    if (!replacement) throw new Error('本局可用武将不足');
    result[index] = replacement; used.add(replacement.id);
  }
  return result;
}

export function openingCards(config: GameConfig): Card[] {
  const state = createOpeningState(config);
  return state.players[config.opening!.humanSeat].hand.map(id => state.cards[id]);
}

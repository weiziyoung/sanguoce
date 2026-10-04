import { type GameState } from "../../domain/state.ts";
import { nextRngState } from '../../domain/prng.ts';

export function random(s: GameState): number {
  s.rng = nextRngState(s.rng);
  return s.rng / 4294967296;
}

export function shuffle(s: GameState, list: number[]): void {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

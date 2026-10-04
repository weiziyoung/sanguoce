import { stealable } from '../../domain/state-access.ts';
import type { GameState } from '../../domain/state.ts';
import { getStandardRuntime } from './runtime.ts';

const service = () => getStandardRuntime().queries;
/** Standard pack facade; grants and ranges come from the content registry. */
export const standardQueries = {
  distance: (s: GameState, from: number, to: number) => service().distance(s, from, to),
  attackRange: (s: GameState, actor: number) => service().attackRange(s, actor),
  shaLimit: (s: GameState, actor: number) => service().shaLimit(s, actor),
  shaTargets: (s: GameState, actor: number) => service().shaTargets(s, actor),
  handLimit: (s: GameState, actor: number) => service().handLimit(s, actor),
  canSha: (s: GameState, from: number, to: number, ignoreDistance = false) =>
    service().canSha(s, from, to, ignoreDistance),
};
export const canSha = standardQueries.canSha;
export const canShun = (s: GameState, from: number, to: number) => from !== to &&
  standardQueries.distance(s, from, to) <= 1 && stealable(s, to).length > 0;

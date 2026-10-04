/** Pure xorshift32 step shared by gameplay and seed-replayable pregame setup. */
export function nextRngState(value: number): number {
  let state = value >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

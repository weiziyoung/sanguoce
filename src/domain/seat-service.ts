/** Array order is seating order. Player IDs are not used as arithmetic seat indices. */
export interface SeatedState {
  readonly players: readonly { readonly id: number; readonly alive: boolean }[];
}

export class SeatService {
  livingOrder(state: SeatedState, anchor: number, includeAnchor = true): number[] {
    const seats = state.players;
    const start = seats.findIndex(player => player.id === anchor);
    if (start < 0) throw new Error('座次锚点不存在');
    const result: number[] = [];
    // A bounded walk also terminates when the anchor has died or everyone has died.
    for (let step = includeAnchor ? 0 : 1; step < seats.length + (includeAnchor ? 0 : 1); step++) {
      const player = seats[(start + step) % seats.length];
      if (player.alive) result.push(player.id);
    }
    return result;
  }
  nextLiving(state: SeatedState, anchor: number): number | null {
    return this.livingOrder(state, anchor, false)[0] ?? null;
  }
  distance(state: SeatedState, from: number, to: number): number {
    const living = state.players.filter(player => player.alive).map(player => player.id);
    const a = living.indexOf(from), b = living.indexOf(to);
    if (a < 0 || b < 0) throw new Error('阵亡角色不能计算距离');
    return Math.min((b - a + living.length) % living.length, (a - b + living.length) % living.length);
  }
}
export const seatService = new SeatService();

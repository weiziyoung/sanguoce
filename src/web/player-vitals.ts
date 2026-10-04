import type { VisiblePlayer } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';

export type PlayerVitalsState = Pick<VisiblePlayer, 'hp' | 'maxHp' | 'alive'>;

/** Update public vitals at the start of each event, before its animation or voice. */
export class PlayerVitalsPresenter {
  private states = new Map<number, PlayerVitalsState>();
  private render: (player: number, state: PlayerVitalsState) => void;
  constructor(render: (player: number, state: PlayerVitalsState) => void) { this.render = render; }

  reset(players: readonly VisiblePlayer[]): void {
    this.states.clear();
    for (const player of players) this.states.set(player.id,
      { hp: player.hp, maxHp: player.maxHp, alive: player.alive });
  }

  play(event: VisibleEvent, effect: () => Promise<void>): Promise<void> {
    const player = event.kind === 'damaged' || event.kind === 'died' ? event.data.target :
      event.kind === 'hpLost' || event.kind === 'recovered' ? event.data.player : undefined;
    const previous = player === undefined ? undefined : this.states.get(player);
    if (player !== undefined && previous) {
      let next: PlayerVitalsState = previous;
      switch (event.kind) {
        case 'damaged': next = { ...previous, hp: event.data.hp, maxHp: event.data.maxHp }; break;
        case 'hpLost': next = { ...previous, hp: previous.hp - event.data.amount }; break;
        case 'recovered': next = { ...previous, hp: Math.min(previous.maxHp, previous.hp + event.data.amount) }; break;
        case 'died': next = { ...previous, hp: Math.min(0, previous.hp), alive: false }; break;
      }
      this.states.set(player, next);
      this.render(player, next);
    }
    return effect();
  }
}

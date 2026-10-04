import { GameEngine } from '../core/game-engine.ts';
import { StandardRuleset } from './standard-game.ts';
import { IdentityGeneralSelector, type IdentityGeneralOffer } from './identity-general-selector.ts';
import type { GeneralCandidate } from './duel-general-selector.ts';

/** Shared five-player seat, visible identity and general draft for CLI and Web. */
export class IdentityPregame {
  readonly seed: number;
  readonly humanSeat: number;
  readonly lordSeat: number;
  readonly role: string;
  readonly offer: IdentityGeneralOffer;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new Error('随机种子必须为整数');
    this.seed = seed;
    this.humanSeat = (seed >>> 0) % 5;
    const preview = new GameEngine(new StandardRuleset(), { mode: 'identity', seed,
      players: Array.from({ length: 5 }, (_, id) => ({ label: `座${id + 1}`, sex: 'male' as const })) });
    const visible = preview.getObservation(this.humanSeat);
    this.role = visible.self.role!;
    this.lordSeat = [visible.self, ...visible.others].find(player => player.role === 'lord')!.id;
    this.offer = new IdentityGeneralSelector().offer(seed, this.lordSeat);
  }

  get candidates(): readonly GeneralCandidate[] { return this.offer.candidates[this.humanSeat]; }

  generals(chosen: GeneralCandidate): readonly GeneralCandidate[] {
    if (!this.candidates.some(general => general.id === chosen.id)) throw new Error('武将不在本局候选中');
    return this.offer.computerPicks.map((pick, seat) => seat === this.humanSeat ? chosen : pick);
  }
}

import { DuelGeneralSelector, shuffleGenerals, type GeneralCandidate } from './duel-general-selector.ts';

export interface IdentityGeneralOffer {
  candidates: readonly (readonly GeneralCandidate[])[];
  computerPicks: readonly GeneralCandidate[];
}

/** Pregame draft for five seats. The lord sees the available lord generals plus two random generals. */
export class IdentityGeneralSelector {
  private readonly selector: DuelGeneralSelector;
  constructor(selector = new DuelGeneralSelector()) { this.selector = selector; }

  offer(seed: number, lordSeat: number): IdentityGeneralOffer {
    if (!Number.isInteger(seed) || lordSeat < 0 || lordSeat >= 5) throw new Error('五人身份局选将参数无效');
    const all = this.selector.generals;
    const lords = all.filter(general => general.abilities.some(id => this.selector.content.requireSkill(id).lordSkill));
    if (lords.length < 3 || all.length < 17) throw new Error('五人身份局需要至少三名主公武将及至少十七名不同武将');
    const nonLords = shuffleGenerals(all.filter(general => !lords.includes(general)), seed ^ 0x517cc1b7);
    const lordPool = [...lords, ...nonLords.slice(0, 2)];
    const remaining = nonLords.slice(2);
    const candidates = Array.from({ length: 5 }, (_, seat) => {
      const pool = seat === lordSeat ? lordPool : remaining.splice(0, 3);
      return pool.map(general => this.selector.describe(general, 'identity'));
    });
    const computerPicks = candidates.map((pool, seat) =>
      shuffleGenerals(pool, seed ^ Math.imul(seat + 1, 0x9e3779b9))[0]);
    return { candidates, computerPicks };
  }
}

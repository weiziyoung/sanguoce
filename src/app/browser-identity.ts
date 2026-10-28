import { openingGenerals, openingCards, pointCandidates, type OpeningOptions } from './browser-opening.ts';
import { contentForCards, type GeneralPack, type CardSet } from './game-content.ts';
import { GameEngine } from '../core/game-engine.ts';
import { StandardRuleset } from './standard-game.ts';
import { DuelGeneralSelector } from './duel-general-selector.ts';
import { IdentityGeneralSelector } from './identity-general-selector.ts';
import { IdentityPregame } from './identity-pregame.ts';
import { StrategicPolicy } from '../policies/strategic-policy.ts';
import type { GameState } from '../domain/state.ts';
import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import type { BrowserSession } from './browser-session.ts';
import { WebGameRecord } from './web-game-record.ts';
import { browserComputerStep } from './browser-computer-step.ts';

/** Five-player Web adapter using the same setup, rule engine and policy as the CLI. */
export class BrowserIdentity implements BrowserSession {
  readonly mode = 'identity';
  readonly seed: number;
  readonly humanSeat: number;
  readonly lordSeat: number;
  readonly role: string;
  readonly pregame: IdentityPregame;
  readonly policy: StrategicPolicy;
  readonly cards: CardSet;
  readonly generalPacks: readonly GeneralPack[];
  game: GameEngine<GameState> | null = null;
  record: WebGameRecord | null = null;

  constructor(seed: number, cards: CardSet = 'standard', generalPacks: readonly GeneralPack[] = []) {
    if (!Number.isInteger(seed)) throw new Error('随机种子必须为整数');
    this.seed = seed;
    this.cards = cards;
    this.generalPacks = [...generalPacks];
    this.policy = new StrategicPolicy(undefined, contentForCards(cards, generalPacks).deck);
    this.pregame = new IdentityPregame(seed, new IdentityGeneralSelector(new DuelGeneralSelector(contentForCards(cards, generalPacks).generals(), contentForCards(cards, generalPacks))));
    this.humanSeat = this.pregame.humanSeat;
    this.role = this.pregame.role;
    this.lordSeat = this.pregame.lordSeat;
  }

  get offer() { return this.pregame.offer; }
  get candidates() { return this.pregame.candidates; }

  get pointCandidates() { return pointCandidates({ mode: 'identity', cards: this.cards, generalPacks: [...this.generalPacks] }); }
  private openingConfig(generalId: string, options: OpeningOptions = {}) {
    const base = { mode: 'identity', cards: this.cards, generalPacks: [...this.generalPacks], seed: this.seed };
    const chosen = this.candidates.find(general => general.id === generalId);
    const picks = !options.pointGeneral && chosen ? this.pregame.generals(chosen) : this.offer.computerPicks;
    const generals = openingGenerals(base, this.candidates, picks, this.humanSeat, generalId, options);
    return { ...base, opening: { humanSeat: this.humanSeat, redraw: !!options.redraw },
      players: generals.map((general, seat) => ({ label: seat === this.humanSeat ? '你' : `电脑${seat + 1}`,
        sex: general.sex, general: general.id })) };
  }
  openingHand(generalId: string, options: OpeningOptions = {}) { return openingCards(this.openingConfig(generalId, options)); }
  start(generalId: string, options: OpeningOptions = {}): void {
    if (this.game) throw new Error('对局已经开始');
    const config = this.openingConfig(generalId, options);
    this.record = new WebGameRecord(config, this.humanSeat);
    this.game = new GameEngine(new StandardRuleset(undefined, undefined, contentForCards(this.cards, this.generalPacks)), config, this.record);
  }

  get decision(): Decision | null { return this.requireGame().getDecision(); }
  get observation(): Observation { return this.requireGame().getObservation(this.humanSeat); }
  get finished(): boolean { return this.requireGame().finished; }
  gameDocument() { if (!this.record) throw new Error('尚未选将'); return this.record.document(); }

  choose(optionId: string, decisionId: string): void {
    const game = this.requireGame();
    const decision = game.getDecision()!;
    const observation = game.getObservation(this.humanSeat);
    game.choose({ optionId, decisionId });
    this.record!.select(decision, optionId, observation);
  }

  computerStep(policy: DecisionPolicy = this.policy, beforeCommit?: () => Promise<void>): void | Promise<void> {
    return browserComputerStep(this.requireGame(), this.record!, this.humanSeat, policy, beforeCommit);
  }

  private requireGame(): GameEngine<GameState> {
    if (!this.game) throw new Error('尚未选将');
    return this.game;
  }
}

import { contentForCards, type GeneralPack, type CardSet } from './game-content.ts';
import { GameEngine } from '../core/game-engine.ts';
import { StandardRuleset } from './standard-game.ts';
import { DuelGeneralSelector, type DuelGeneralOffer } from './duel-general-selector.ts';
import { StrategicPolicy } from '../policies/strategic-policy.ts';
import type { GameState } from '../domain/state.ts';
import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import type { BrowserSession } from './browser-session.ts';
import { WebGameRecord } from './web-game-record.ts';
import { browserComputerStep } from './browser-computer-step.ts';

/** Browser and CLI use the same selector, rules and policy. This class owns no rules. */
export class BrowserDuel implements BrowserSession {
  readonly mode = 'duel';
  readonly humanSeat = 0;
  readonly seed: number;
  readonly offer: DuelGeneralOffer;
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
    this.offer = new DuelGeneralSelector(contentForCards(cards, generalPacks).generals(), contentForCards(cards, generalPacks)).offer(seed);
  }

  get candidates() { return this.offer.player; }

  start(playerGeneralId: string): void {
    const player = this.offer.player.find(general => general.id === playerGeneralId);
    if (!player) throw new Error('武将不在本局候选中');
    const config = { cards: this.cards, generalPacks: [...this.generalPacks], seed: this.seed,
      players: [
        { label: player.label, sex: player.sex, general: player.id },
        { label: this.offer.computerPick.label, sex: this.offer.computerPick.sex,
          general: this.offer.computerPick.id },
      ],
    };
    this.record = new WebGameRecord(config, this.humanSeat);
    this.game = new GameEngine(new StandardRuleset(undefined, undefined, contentForCards(this.cards, this.generalPacks)), config, this.record);
  }

  get decision(): Decision | null { return this.requireGame().getDecision(); }
  get observation(): Observation { return this.requireGame().getObservation(0); }
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

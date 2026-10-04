import { GameEngine } from '../core/game-engine.ts';
import { StandardRuleset } from './standard-game.ts';
import { DuelGeneralSelector, type DuelGeneralOffer } from './duel-general-selector.ts';
import { StrategicPolicy } from '../policies/strategic-policy.ts';
import type { GameState } from '../domain/state.ts';
import type { Decision, Observation } from '../../contracts.ts';
import type { BrowserSession } from './browser-session.ts';
import { WebGameRecord } from './web-game-record.ts';

/** Browser and CLI use the same selector, rules and policy. This class owns no rules. */
export class BrowserDuel implements BrowserSession {
  readonly mode = 'duel';
  readonly humanSeat = 0;
  readonly seed: number;
  readonly offer: DuelGeneralOffer;
  readonly policy = new StrategicPolicy();
  game: GameEngine<GameState> | null = null;
  record: WebGameRecord | null = null;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new Error('随机种子必须为整数');
    this.seed = seed;
    this.offer = new DuelGeneralSelector().offer(seed);
  }

  get candidates() { return this.offer.player; }

  start(playerGeneralId: string): void {
    const player = this.offer.player.find(general => general.id === playerGeneralId);
    if (!player) throw new Error('武将不在本局候选中');
    const config = { seed: this.seed,
      players: [
        { label: player.label, sex: player.sex, general: player.id },
        { label: this.offer.computerPick.label, sex: this.offer.computerPick.sex,
          general: this.offer.computerPick.id },
      ],
    };
    this.record = new WebGameRecord(config, this.humanSeat);
    this.game = new GameEngine(new StandardRuleset(), config, this.record);
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

  computerStep(): void {
    const game = this.requireGame();
    const decision = game.getDecision();
    if (!decision || decision.actor !== 1) throw new Error('当前不是电脑决策');
    const optionId = this.policy.choose(game.getObservation(1), decision);
    game.choose({ decisionId: decision.id!, optionId });
    this.record!.select(decision, optionId);
  }

  private requireGame(): GameEngine<GameState> {
    if (!this.game) throw new Error('尚未选将');
    return this.game;
  }
}

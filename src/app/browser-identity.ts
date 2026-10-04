import { GameEngine } from '../core/game-engine.ts';
import { StandardRuleset } from './standard-game.ts';
import { IdentityPregame } from './identity-pregame.ts';
import { StrategicPolicy } from '../policies/strategic-policy.ts';
import type { GameState } from '../domain/state.ts';
import type { Decision, Observation } from '../../contracts.ts';
import type { BrowserSession } from './browser-session.ts';
import { WebGameRecord } from './web-game-record.ts';

/** Five-player Web adapter using the same setup, rule engine and policy as the CLI. */
export class BrowserIdentity implements BrowserSession {
  readonly mode = 'identity';
  readonly seed: number;
  readonly humanSeat: number;
  readonly lordSeat: number;
  readonly role: string;
  readonly pregame: IdentityPregame;
  readonly policy = new StrategicPolicy();
  game: GameEngine<GameState> | null = null;
  record: WebGameRecord | null = null;

  constructor(seed: number) {
    if (!Number.isInteger(seed)) throw new Error('随机种子必须为整数');
    this.seed = seed;
    this.pregame = new IdentityPregame(seed);
    this.humanSeat = this.pregame.humanSeat;
    this.role = this.pregame.role;
    this.lordSeat = this.pregame.lordSeat;
  }

  get offer() { return this.pregame.offer; }
  get candidates() { return this.pregame.candidates; }

  start(generalId: string): void {
    const player = this.candidates.find(general => general.id === generalId);
    if (!player) throw new Error('武将不在本局候选中');
    const generals = this.pregame.generals(player);
    const config = { mode: 'identity', seed: this.seed,
      players: generals.map((general, seat) => ({
        label: seat === this.humanSeat ? '你' : `电脑${seat + 1}`,
        sex: general.sex, general: general.id,
      })),
    };
    this.record = new WebGameRecord(config, this.humanSeat);
    this.game = new GameEngine(new StandardRuleset(), config, this.record);
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

  computerStep(): void {
    const game = this.requireGame();
    const decision = game.getDecision();
    if (!decision || decision.actor === this.humanSeat) throw new Error('当前不是电脑决策');
    const optionId = this.policy.choose(game.getObservation(decision.actor), decision);
    game.choose({ decisionId: decision.id!, optionId });
    this.record!.select(decision, optionId);
  }

  private requireGame(): GameEngine<GameState> {
    if (!this.game) throw new Error('尚未选将');
    return this.game;
  }
}

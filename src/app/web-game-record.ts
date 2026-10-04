import type { Decision, GameConfig, GameOutcome, Observation, Transition } from '../../contracts.ts';
import type { RuleEvent } from '../domain/events.ts';
import type { GameState } from '../domain/state.ts';

export interface RecordedChoice {
  actor: number;
  human: boolean;
  decision: Decision;
  optionId: string;
  /** The human's information at decision time; never an omniscient state snapshot. */
  observation?: Observation;
}

export interface WebGameDocument {
  format: 'sanguosha.web-game.v1';
  startedAt: string;
  finishedAt: string;
  humanSeat: number;
  config: GameConfig;
  choices: RecordedChoice[];
  events: RuleEvent[];
  players: { id: number; label: string; general?: string; role?: string }[];
  outcome: GameOutcome;
  turn: number;
}

/** Compact replayable journal: seed/config + every choice, with human-view snapshots. */
export class WebGameRecord {
  readonly config: GameConfig;
  readonly humanSeat: number;
  readonly startedAt = new Date().toISOString();
  readonly choices: RecordedChoice[] = [];
  readonly events: RuleEvent[] = [];
  private eventCount = 0;
  private finalState: GameState | null = null;

  constructor(config: GameConfig, humanSeat: number) {
    this.config = structuredClone(config);
    this.humanSeat = humanSeat;
  }

  record(_transition: Transition, state: GameState): void {
    this.events.push(...structuredClone(state.events.slice(this.eventCount)));
    this.eventCount = state.events.length;
    if (state.outcome.status !== 'ongoing') this.finalState = state;
  }

  select(decision: Decision, optionId: string, observation?: Observation): void {
    this.choices.push({ actor: decision.actor, human: decision.actor === this.humanSeat,
      decision: structuredClone(decision), optionId,
      ...(observation ? { observation: structuredClone(observation) } : {}) });
  }

  document(): WebGameDocument {
    const state = this.finalState;
    if (!state) throw new Error('对局尚未结束');
    return {
      format: 'sanguosha.web-game.v1', startedAt: this.startedAt,
      finishedAt: new Date().toISOString(), humanSeat: this.humanSeat,
      config: structuredClone(this.config), choices: structuredClone(this.choices),
      events: structuredClone(this.events),
      players: state.players.map(player => ({ id: player.id, label: player.label,
        ...(player.general ? { general: player.general } : {}),
        ...(state.mode.roles[player.id] ? { role: state.mode.roles[player.id] } : {}) })),
      outcome: structuredClone(state.outcome), turn: state.turn,
    };
  }
}

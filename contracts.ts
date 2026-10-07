import type { Card, CardPack } from "./catalog.ts";

export type PlayerId = number;
export interface PlayerConfig {
  label: string;
  sex: "male" | "female";
  /** Optional registered general; fixed basic roles remain the default. */
  general?: string;
}
export type GameOutcome =
  | { status: 'ongoing' }
  | { status: 'finished'; winners: PlayerId[]; losers: PlayerId[]; reason: string }
  | { status: 'draw'; reason: string };
export interface GameConfig {
  /** Defaults to duel. Mode definitions are registered by application assembly. */
  mode?: string;
  /** Optional fixed role assignment in seat order; otherwise the mode randomizes. */
  roles?: string[];
  seed?: number;
  players?: PlayerConfig[];
  initialHp?: number;
  first?: number;
  /** Standard remains available for reproducible legacy games. */
  cards?: 'standard' | 'junzheng';
  deck?: readonly Omit<Card, "id">[];
}
export interface Choice {
  id: string;
  label: string;
  children?: Choice[];
  data?: unknown;
}
export interface Decision {
  /** Identifies the current decision when delivered through GameEngine. */
  id?: string;
  actor: PlayerId;
  kind: string;
  title: string;
  options: Choice[];
  context?: unknown;
}
export interface VisiblePlayer {
  id: PlayerId;
  label: string;
  sex: "male" | "female";
  general?: string;
  group?: 'wei' | 'shu' | 'wu' | 'qun';
  hp: number;
  maxHp: number;
  alive: boolean;
  handCount: number;
  chained?: boolean; drunk?: number;
  /** Omitted when the viewer is not entitled to know the role. */
  role?: string;
  equip: Record<string, Card | null>;
  judge: Card[];
}
export interface Observation {
  events: import("./src/domain/events.ts").VisibleEvent[];
  /** Whole-game public behavior totals, independent of the recent event window. */
  publicInteractions?: import('./src/domain/public-interactions.ts').PublicInteraction[];
  /** Public cards referenced by visible events, for presentation and replay. */
  eventCards?: Record<number, Card>;
  mode: { id: string };
  turn: number;
  phase: string;
  active: PlayerId;
  actor: PlayerId | null;
  self: VisiblePlayer & { hand: Card[] };
  others: VisiblePlayer[];
  deckCount: number;
  discardCount: number;
  discardTop: Card | null;
  table: Card[];
  shaUsed: number;
  jiuUsed?: number;
  nullify: { source: PlayerId; target: PlayerId; cname: string; parity: number; cardLabel?: string } | null;
  log: string[];
  outcome: GameOutcome;
}
export interface RuleSet<S> {
  readonly pack: CardPack;
  isFinished?(state: S): boolean;
  create(config?: GameConfig, trace?: TransitionSink<S>): S;
  decision(state: S): Decision | null;
  observe(state: S, playerId: PlayerId): Observation;
  legalActions(state: S): Choice[];
  apply(state: S, choiceId: string, trace?: TransitionSink<S>): S;
}
export type Transition =
  | { type: "setup" }
  | { type: "choice"; frameId?: number; actor: PlayerId; promptKind: string; choiceId: string; choiceLabel: string }
  | { type: "task"; frameId?: number; parentFrameId?: number | null; task: unknown }
  | { type: "frameEnd"; frameId: number; parentFrameId: number };
export type TransitionSink<S> = (transition: Transition, state: S) => void;
export interface DecisionPolicy {
  choose(observation: Observation, decision: Decision): Promise<string> | string;
}

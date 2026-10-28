import type { Card } from '../../catalog.ts';
import type { OpeningOptions } from './browser-opening.ts';
import type { Decision, DecisionPolicy, Observation } from '../../contracts.ts';
import type { GeneralCandidate } from './duel-general-selector.ts';
import type { WebGameDocument } from './web-game-record.ts';

/** Web-only session boundary. Rules and AI remain in the shared engine and policy. */
export interface BrowserSession {
  readonly mode: 'duel' | 'identity';
  readonly seed: number;
  readonly humanSeat: number;
  readonly candidates: readonly GeneralCandidate[];
  readonly role?: string;
  readonly lordSeat?: number;
  readonly decision: Decision | null;
  readonly observation: Observation;
  readonly finished: boolean;
  gameDocument(): WebGameDocument;
  readonly pointCandidates?: readonly GeneralCandidate[];
  openingHand?(generalId: string, options?: OpeningOptions): Card[];
  start(generalId: string, options?: OpeningOptions): void;
  choose(optionId: string, decisionId: string): void;
  computerStep(policy?: DecisionPolicy, beforeCommit?: () => Promise<void>): void | Promise<void>;
}

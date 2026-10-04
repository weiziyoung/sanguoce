import type { Decision, Observation } from '../../contracts.ts';
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
  start(generalId: string): void;
  choose(optionId: string, decisionId: string): void;
  computerStep(): void;
}

import type { CardLike, CardName, DamageNature } from '../../catalog.ts';
import type { AttackContext } from './state.ts';
import type { CardZone } from './zones.ts';

export interface TriggerSignals {
  attackTargeted: AttackContext;
  attackMissed: AttackContext;
  beforeAttackDamage: AttackContext;
  cardUsed: { source: number; card: number; targets: number[]; effectiveName?: CardName };
  damageTaken: { target: number; source: number | null; amount: number; card: number | CardLike | null; nature?: DamageNature };
  judgementApplied: { player: number; reason: CardName; card: number };
  cardsLost: { player: number; hand: number[]; equip: number[] };
}
export type TriggerKind = keyof TriggerSignals;
export type TriggerSignal = { [K in TriggerKind]: { kind: K; data: TriggerSignals[K] } }[TriggerKind];
export type DiscardReason = 'discard' | 'use' | 'respond' | 'convertToSha';
export interface ZoneSelection { cause: CardName; fromZone: 'hand' | 'equip' | 'judge'; }
export interface EventData extends TriggerSignals {
  cardsMoved: { moves: { card: number; from: CardZone; to: CardZone }[] };
  hpChanged: { player: number; before: number; after: number };
  hpLost: { player: number; amount: number };
  triggerInvoked: { definition: string; owner: number; eventId: number };
  chainChanged: { player: number; chained: boolean };
  wineUsed: { player: number; bonus: number };
  cardRecast: { player: number; card: number };
  cardRevealed: { player: number; card: number; cause: CardName };
  drawSkipped: { player: number };
  drawn: { player: number; count: number };
  judged: { player: number; reason: CardName; reasonLabel?: string; card: number };
  judgementReplaced: { player: number; owner: number; reason: CardName; reasonLabel?: string;
    oldCard: number; newCard: number; ability: string; label: string };
  discarded: { player: number; card: number; reason: DiscardReason; selection?: ZoneSelection;
    responseMode?: 'juedou' };
  duelResponded: { player: number; card: number; effectiveName: CardName };
  duelEnded: { loser: number };
  gained: { from: number; to: number; card: number; hidden: boolean; selection?: ZoneSelection; cause?: string };
  rescued: { source: number; target: number };
  attackDeclared: { source: number; target: number; redirectedBy?: number; forcedBy?: number };
  equipped: { player: number; card: number; replaced: boolean };
  recovered: { player: number; source?: number; amount: number };
  damaged: { target: number; source: number | null; amount: number; hp: number; maxHp: number;
    card: number | CardLike | null; nature?: DamageNature; propagated?: boolean; redirectedBy?: number; forcedBy?: number };
  dying: { target: number };
  died: { target: number; source?: number | null };
  reshuffled: {};
  turnStarted: { player: number; turn: number };
  playSkipped: { player: number; announced: boolean };
  delayPlaced: { source: number; target: number; card: number; effectiveName?: CardName };
  harvestRevealed: { cards: number[] };
  harvestLeftover: { card: number };
  harvestTaken: { player: number; card: number };
  borrowedAttack: { player: number };
  lightningMoved: { target: number | null };
  trickCancelled: { cname: CardName; target: number };
  nullificationUsed: { player: number; card: number; cname: CardName; target: number; parityBefore: number };
  abilityActivated: { ability: CardName; owner: number | null;
    effect: 'followUp' | 'forceHit' | 'preventDamage' | 'virtualSha' | 'autoShan' | 'blockBlackSha' };
  transformationUsed: { ability: string; label: string; owner: number; produces?: CardName;
    responseMode?: 'juedou' };
  skillActivated: { ability: string; label: string; owner: number; targets: number[] };
  rolesRevealed: { roles: { player: number; role: string }[] };
}
export type EventOf<K extends keyof EventData> = {
  id: number; frameId: number | null; parentEventId: number | null; kind: K; data: EventData[K];
};
export type RuleEvent = { [K in keyof EventData]: EventOf<K> }[keyof EventData];
export type TriggerEvent = { [K in TriggerKind]: EventOf<K> }[TriggerKind];
type InternalKind = Exclude<TriggerKind, 'cardUsed'> | 'cardsMoved' | 'hpChanged' | 'triggerInvoked';
export type VisibleEventData = Omit<EventData, InternalKind | 'gained'> & {
  gained: { from: number; to: number; card: number | null; selection?: ZoneSelection; cause?: string };
};
export type VisibleEvent = { [K in keyof VisibleEventData]: { id: number; kind: K; data: VisibleEventData[K] } }[keyof VisibleEventData];

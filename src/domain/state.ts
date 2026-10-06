import type { Card, CardLike, CardName, DamageNature } from '../../catalog.ts';
import type { Choice, GameOutcome } from '../../contracts.ts';
import type { DeathContext, ModeState } from './mode.ts';
import type { RuleEvent, TriggerSignal } from './events.ts';
import type { ResolutionState } from './resolution.ts';

export type EquipSlot = 'weapon' | 'armor' | 'plusHorse' | 'minusHorse';
export type Equipment = Record<EquipSlot, number | null>;
export interface PlayerState {
  id: number; label: string; sex: 'male' | 'female';
  general?: string;
  group?: 'wei' | 'shu' | 'wu' | 'qun';
  hp: number; maxHp: number; alive: boolean;
  chained?: boolean; drunk?: number;
  hand: number[]; equip: Equipment; judge: number[];
}
export interface AttackContext {
  source: number; target: number; sha: number | CardLike; ignoreDistance?: boolean;
  redirectedBy?: number; forcedBy?: number;
  nature?: DamageNature; damageBonus?: number; ignoreArmor?: boolean;
}
export interface TrickContext {
  trickFrameId: number;
  cname: CardName; source: number; target: number; cid: number; second?: number | null;
}
export interface ZoneContext {
  source: number; target: number; cname?: CardName; label?: string; gain?: boolean;
  handAndEquipOnly?: boolean; hanbingRemaining?: number;
}
export type ResponseContext =
  | { mode: 'sha'; actor: number; source: number; sha: number | CardLike; nature?: DamageNature; damageBonus?: number; ignoreArmor?: boolean;
      redirectedBy?: number; forcedBy?: number; baguaTried?: boolean;
      remaining?: number; proxyTried?: boolean }
  | { mode: 'juedou' | 'nanman' | 'wanjian'; actor: number; source: number;
      cardId?: number; cardName?: CardName; baguaTried?: boolean; remaining?: number; proxyTried?: boolean };
export interface TaskData {
  openTriggers: { signal: TriggerSignal; then: Task[] }; triggerCollect: {}; triggerNext: {}; triggerExecute: {};
  cardUseStart: {}; responsePoll: {}; proxyResponsePoll: {}; proxyResponseSuccess: {};
  attackPrepare: {}; attackLaunch: {};
  equipmentLeft: { owner: number; cid: number };
  fireAttackPay: { source: number; target: number; cid: number; suit: import('../../catalog.ts').Suit };
  damagePropagate: { target: number; source: number | null; amount: number; card: number | CardLike | null; nature: DamageNature };
  damageApply: {}; dyingPoll: {}; nullifyPoll: {};
  skillExecute: {}; skillEffect: {}; skillDying: {}; skillSelectCost: {}; skillSelectTarget: {};
  distributionPoll: {};
  deckReorderPoll: {};
  judgementDraw: {}; judgementOffer: {}; judgementFinalize: {}; judgementTriggers: {};
  applyDelayedJudgement: { owner: number; cid: number }; applyBaguaJudgement: {};
  applyAttackJudgement: AttackContext & { ability: string };
  applySkillJudgement: { ability: string; owner: number; source: number | null };
  resolveCardUse: { source: number; cid: number; targets: number[] };
  resolveVirtualTrick: { source: number; cid: number; cname: CardName; targets: number[] };
  death: { context: DeathContext };
  phaseStart: {}; phaseJudge: {}; phaseDraw: {}; phasePlay: {}; phaseDiscard: {}; phaseEnd: {};
  phaseStartOffer: { ability: string; owner: number };
  phaseEndOffer: { ability: string; owner: number };
  phaseEndAdvance: {};
  applyStartSkillJudgement: { ability: string; owner: number };
  phaseDiscardNormal: {};
  judgeCard: { owner: number; cid: number };
  resolveJudge: { owner: number; cid: number };
  cancelJudge: { owner: number; cid: number };
  finishCard: { cid: number };
  trickTarget: TrickContext; resolveTrick: TrickContext;
  wuguCleanup: {};
  attackDamage: AttackContext;
  shaStart: AttackContext; shaRespond: AttackContext; shaMiss: AttackContext; shaHit: AttackContext;
  hanbingPick: { source: number; target: number; remaining: number };
}
export type TaskOf<K extends keyof TaskData> = { kind: K } & TaskData[K];
export type Task = { [K in keyof TaskData]: TaskOf<K> }[keyof TaskData];
export interface ActionMap {
  play: { type: 'recast'; cid: number } | { type: 'play'; cid: number; targets: number[] } |
    { type: 'virtualSha'; ids: number[]; targets: number[]; transformation?: string } |
    { type: 'virtualTrick'; cname: CardName; ids: number[]; targets: number[]; transformation: string } |
    { type: 'virtualDelay'; cname: CardName; ids: number[]; targets: number[]; transformation: string } |
    { type: 'proxySha'; ability: string; targets: number[] } |
    { type: 'activeSkill'; ability: string; ids: number[]; targets: number[] } |
    { type: 'beginSkill'; ability: string } | { type: 'endPlay' };
  attackPrepare: { type: 'yes' } | { type: 'no' };
  fireAttackReveal: { type: 'reveal'; cid: number };
  fireAttackPay: { type: 'discard'; cid: number } | { type: 'pass' };
  skillCost: { type: 'toggle'; cid: number } | { type: 'confirm' } | { type: 'cancel' };
  skillTarget: { type: 'select'; targets: number[] };
  skillFollowup: { type: 'choose'; choice: string };
  skillJudgementChoice: { type: 'choose'; choice: string; ids: number[] };
  distribution: { type: 'assign'; card: number; target: number };
  deckReorder: { type: 'place'; card: number; side: 'top' | 'bottom' };
  phaseStartChoice: { type: 'yes' } | { type: 'no' };
  phaseEndChoice: { type: 'yes' } | { type: 'no' };
  phaseDiscardChoice: { type: 'skip' } | { type: 'continue' };
  phaseDrawChoice: { type: 'normal' } | { type: 'skill'; ability: string; choice: string; targets?: number[] };
  judgeReplace: { type: 'replace'; cid: number } | { type: 'pass' };
  discard: { type: 'discard'; cid: number };
  nullify: { type: 'nullify'; cid: number } | { type: 'pass' };
  dying: { type: 'save'; ids: number[]; transformation?: string } | { type: 'pass' };
  respond: { type: 'respond'; ids: number[]; transformation?: string } |
    { type: 'bagua' } | { type: 'proxy'; ability: string } | { type: 'pass' };
  proxyResponse: { type: 'respond'; ids: number[]; transformation?: string } | { type: 'pass' };
  attackRedirect: { type: 'redirect'; card: number; target: number } | { type: 'pass' };
  triggerConfirm: { type: 'yes' } | { type: 'no' };
  zone: { type: 'zone'; zone: 'hand'; slot: number } | { type: 'zone'; zone: 'equip' | 'judge'; cid: number };
  wugu: { type: 'wugu'; cid: number };
  jiedao: { type: 'jiedaoSha'; ids: number[]; transformation?: string } | { type: 'pass' };
  cixiong: { type: 'yes' } | { type: 'no' };
  cixiongCost: { type: 'discard'; cid: number } | { type: 'draw' };
  qinglong: { type: 'qinglong'; ids: number[]; transformation?: string } | { type: 'pass' };
  guanshi: { type: 'guanshi'; ids: number[] } | { type: 'pass' };
  hanbing: { type: 'yes' } | { type: 'no' };
  hanbingPick: ActionMap['zone'];
  qilin: { type: 'qilin'; cid: number } | { type: 'pass' };
}
export interface PromptContextMap {
  attackPrepare: { ability: string; source: number; targets: number[]; damageBonus: number };
  fireAttackReveal: { source: number; target: number; cid: number };
  fireAttackPay: { source: number; target: number; cid: number; suit: import('../../catalog.ts').Suit };
  play: {}; discard: { required: number }; nullify: {}; dying: { target?: number }; wugu: {};
  skillCost: { ability: string; selectedIds: number[] }; skillTarget: { ability: string; selectedIds: number[] };
  skillFollowup: { ability: string; owner: number };
  skillJudgementChoice: { ability: string; owner: number; source: number | null };
  distribution: { ability: string; owner: number };
  deckReorder: { ability: string; owner: number };
  phaseStartChoice: { ability: string; owner: number };
  phaseEndChoice: { ability: string; owner: number };
  phaseDiscardChoice: { ability: string; label: string };
  phaseDrawChoice: {};
  judgeReplace: { ability: string; owner: number; subject: number; reason: string; currentId: number };
  triggerConfirm: { definition: string; owner: number; eventId: number };
  respond: ResponseContext; proxyResponse: { requester: number; ability: string; current: number };
  attackRedirect: AttackContext & { owner: number; ability: string };
  zone: ZoneContext; hanbingPick: ZoneContext & { hanbingRemaining: number };
  jiedao: { source: number; target: number };
  cixiong: AttackContext; cixiongCost: AttackContext; qinglong: AttackContext;
  guanshi: AttackContext; hanbing: AttackContext; qilin: AttackContext;
}
export type ActionData = ActionMap[keyof ActionMap];
export interface InternalOption extends Choice { data?: ActionData; children?: InternalOption[]; }
export type PromptOf<K extends keyof PromptContextMap> = {
  frameId: number; actor: number; kind: K; title: string; options: InternalOption[]; context: PromptContextMap[K];
};
export type InternalPrompt = { [K in keyof PromptContextMap]: PromptOf<K> }[keyof PromptContextMap];
export interface NullificationState {
  effect: Task | null; cancel: Task | null; source: number; target: number; cname: CardName;
  parity: number; passed: number[]; cursor: number; result: 'effective' | 'cancelled' | null;
}
export type DamageCause =
  | { kind: 'damage'; source: number | null; amount: number; card: number | CardLike | null }
  | { kind: 'hpLoss'; source: null };
export interface DyingState { target: number; cursor: number; passed: number[]; cause: DamageCause; }
export interface GameState {
  cards: Record<number, Card>; deck: number[]; discard: number[]; table: number[];
  players: PlayerState[]; rng: number; active: number; turn: number;
  phase: 'setup' | 'start' | 'judge' | 'draw' | 'play' | 'discard' | 'end' | 'finished';
  shaUsed: number; resolution: ResolutionState;
  shaPlayedOrRespondedInPlay?: boolean;
  turnMarks?: { owner: number; ability: string; turn: number }[];
  skillUses?: { owner: number; ability: string; turn: number; count: number }[];
  skillProgress?: { owner: number; ability: string; turn: number; count: number }[];
  virtualJudgeNames?: { card: number; name: CardName }[];
  jiuUsed?: number; skipDraw?: boolean;
  mode: ModeState; outcome: GameOutcome; events: RuleEvent[]; skipPlay: boolean;
}

/** Read-only rule views prevent modifiers from mutating nested zones or counters. */
export type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type ReadonlyGameState = DeepReadonly<GameState>;

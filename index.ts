export { GameEngine, StandardRuleset } from "./engine.ts";
export type { GameState } from "./engine.ts";
export { StandardCardPack, STANDARD_DECK, JUNZHENG_DECK, EXPANDED_DECK, cardText, cardAssetKey, cardLabel } from "./catalog.ts";
export { RuleBasePolicy, SimpleRulePolicy } from "./policy.ts";
export { RuleBaseCardEvaluator } from "./rule-base-policy.ts";
export { CARD_AI_PROFILE, type CardAiProfile } from "./card-ai-profile.ts";
export { ChineseView, LocalizedChoiceSet } from "./chinese-view.ts";
export { GameTrace } from "./trace.ts";
export type { TraceFrame } from "./trace.ts";
export type { Card, CardName, CardPack, DeckEntry, DamageNature } from "./catalog.ts";
export type {
  Choice, Decision, DecisionPolicy, GameConfig, GameOutcome, Observation, PlayerConfig,
  PlayerId, RuleSet, Transition, TransitionSink, VisiblePlayer,
} from "./contracts.ts";

export type { Selection, TraceRecorder } from "./src/core/game-engine.ts";

export { DuelMode } from './src/modes/duel-mode.ts';
export { IdentityMode } from './src/modes/identity-mode.ts';
export type { IdentityRole } from './src/modes/identity-mode.ts';
export { ModeRegistry } from './src/rules/mode-registry.ts';
export type { ModeDefinition, ModeSetup, ModeState, ModeEffect, DeathContext, DeathWindow } from './src/domain/mode.ts';

export { TriggerRegistry } from './src/rules/trigger-registry.ts';
export type { TriggerDefinition } from './src/rules/trigger-registry.ts';
export type { RuleEvent, VisibleEvent, TriggerEvent } from './src/domain/events.ts';
export { ContentRegistry } from './src/rules/content-registry.ts';
export type { ContentPack, CardDefinition, SkillDefinition, GeneralDefinition } from './src/rules/content-registry.ts';
export { AbilityResolver } from './src/rules/ability-resolver.ts';
export type { AbilityInstance } from './src/rules/ability-resolver.ts';
export { ContentRuntime } from './src/rules/content-runtime.ts';
export { standardPack, standardContent } from './src/content/standard/content.ts';
export { pilotSkillPack } from './src/content/pilot/content.ts';
export { StrategicPolicy } from './src/policies/strategic-policy.ts';
export { RULE_POLICY_VERSION } from './src/policies/rule-policy-version.ts';
export { JevPolicy } from './src/policies/jev-policy.ts';
export type { JevPolicyOptions } from './src/policies/jev-policy.ts';
export { LayaPolicy } from './src/policies/laya-policy.ts';
export type { LayaPolicyOptions } from './src/policies/laya-policy.ts';
export { EvaluationRegistry } from './src/policies/evaluation-registry.ts';

export { junzhengPack } from './src/content/junzheng/content.ts';
export { expandedContent, contentForCards, type CardSet } from './src/app/game-content.ts';

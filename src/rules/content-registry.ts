import type { CardLike, CardName, DeckEntry, DamageNature } from '../../catalog.ts';
import type { AttackContext, EquipSlot, GameState, ReadonlyGameState } from '../domain/state.ts';
import type { CardTransformation } from './card-transform-resolver.ts';
import type { AnyTriggerDefinition } from './trigger-registry.ts';
import type { ContentRuntime } from './content-runtime.ts';

export type CardKind = 'basic' | 'trick' | 'delay' | 'equip';
export type PlayTargeting = 'unplayable' | 'none' | 'single' | 'attack' | 'borrowed' | 'multiple';
export type PlayAvailability = 'wounded' | 'uniqueSelfJudge' | 'drink';
export type TargetRule = 'stealable' | 'distance1Stealable' | 'uniqueTargetJudge' | 'armed' | 'hasHand' | 'distance1UniqueJudge';
export type CardEffect = 'none' | 'attack' | 'recover' | 'equip' | 'delay' | 'drawTwo' |
  'recoverOne' | 'requireSha' | 'requireShan' | 'duel' | 'gainZone' |
  'discardZone' | 'borrowed' | 'harvest' | 'custom';
export interface CardDefinition {
  readonly id: CardName;
  readonly label: string;
  readonly kind: CardKind;
  readonly slot?: EquipSlot;
  readonly range?: number;
  /** Granted while this card is equipped. */
  readonly abilities?: readonly string[];
  readonly play: { readonly targeting: PlayTargeting; readonly availability?: PlayAvailability;
    readonly targetRule?: TargetRule; readonly allowSelf?: boolean; readonly maxTargets?: number; readonly recast?: boolean;
    readonly scope?: 'selected' | 'self' | 'all' | 'others' };
  readonly effect: CardEffect;
  readonly useEffect?: (state: GameState, source: number, cid: number, runtime: ContentRuntime) => void;
  readonly trickEffect?: (state: GameState, context: import('../domain/state.ts').TrickContext, runtime: ContentRuntime) => void;
  readonly delayedEffect?: (state: GameState, owner: number, cid: number, result: number | null, runtime: ContentRuntime) => void;
  readonly leaveEquipment?: (state: GameState, owner: number, cid: number) => void;
}
export interface SkillDefinition {
  readonly grantedTo?: (state: ReadonlyGameState, owner: number) => boolean;
  readonly phaseBefore?: { readonly phases: readonly ('judge' | 'play')[]; execute(state: GameState, owner: number, phase: 'judge' | 'play', runtime: ContentRuntime): void };
  readonly beforeDamage?: (state: GameState, owner: number, runtime: ContentRuntime) => void;
  readonly afterDamage?: (state: GameState, owner: number, context: import('../domain/resolution.ts').FrameData['damage'], amount: number, runtime: ContentRuntime) => void;
  readonly hpChanged?: (state: GameState, owner: number, before: number, after: number, runtime: ContentRuntime) => void;
  readonly responseUsed?: (state: GameState, owner: number, name: CardName, runtime: ContentRuntime) => void;
  readonly choice?: {
    options(state: ReadonlyGameState, owner: number, context: import('../domain/state.ts').ContentChoiceContext, runtime: ContentRuntime): readonly { id: string; label: string; ids?: readonly number[]; targets?: readonly number[]; pass?: boolean }[];
    execute(state: GameState, owner: number, context: import('../domain/state.ts').ContentChoiceContext, action: import('../domain/state.ts').ContentChoiceAction, runtime: ContentRuntime): void;
  };
  readonly callback?: (state: GameState, owner: number, context: import('../domain/state.ts').ContentChoiceContext, runtime: ContentRuntime) => void;
  readonly id: string;
  readonly label?: string;
  /** Display metadata; lord eligibility remains enforced by mode rules. */
  readonly lordSkill?: boolean;
  readonly proxyResponse?: { produces: 'sha' | 'shan'; group: 'wei' | 'shu' | 'wu' | 'qun' };
  readonly attackRedirect?: {
    costs(state: ReadonlyGameState, owner: number): readonly number[];
    targets(state: ReadonlyGameState, owner: number, attack: AttackContext,
      runtime: ContentRuntime): readonly number[];
  };
  readonly active?: ActiveSkillDefinition;
  readonly drawPhase?: { readonly optional?: boolean;
    options(state: ReadonlyGameState, owner: number): readonly { id: string; label: string; targets: readonly number[] }[];
    execute(state: GameState, owner: number, targets: readonly number[], runtime: ContentRuntime): void };
  readonly startPhase?: {
    available(state: ReadonlyGameState, owner: number): boolean;
    activate(state: GameState, owner: number, runtime: ContentRuntime): void;
    onJudgement?(state: GameState, owner: number, finalId: number | null): boolean;
  };
  readonly endPhase?: {
    readonly optional?: boolean;
    available(state: ReadonlyGameState, owner: number): boolean;
    execute(state: GameState, owner: number): void;
  };
  readonly trigger?: AnyTriggerDefinition;
  readonly transformation?: CardTransformation;
  readonly transformations?: readonly CardTransformation[];
  readonly judgement?: { cards(state: ReadonlyGameState, owner: number): readonly number[]; readonly gainReplaced?: boolean; readonly allowEquipment?: boolean };
  readonly attackJudgement?: { bypassResponse(state: ReadonlyGameState, owner: number, finalId: number | null): boolean };
  readonly skillJudgement?: {
    actor(state: ReadonlyGameState, owner: number, source: number | null): number | null;
    options(state: ReadonlyGameState, owner: number, source: number | null, finalId: number | null):
      readonly { id: string; label: string; cardIds?: readonly number[] }[];
    execute(state: GameState, owner: number, source: number | null, finalId: number | null, choice: string): void;
  };
  readonly modifier?: SkillModifier;
  readonly prepareAttack?: {
    available(state: ReadonlyGameState, source: number, nature: DamageNature): boolean;
    nature: DamageNature;
  };
}
export interface ActiveSkillDefinition {
  readonly limit?: 'oncePerTurn';
  readonly cost: 'discardOwned' | 'transfer' | 'none' | 'loseHp' | 'custom';
  /** Small fixed costs can be offered directly; large sets use selection. */
  costs?(state: ReadonlyGameState, owner: number): readonly (readonly number[])[];
  readonly selection?: { readonly min: number; readonly max?: number;
    selectable(state: ReadonlyGameState, owner: number): readonly number[] };
  targets(state: ReadonlyGameState, owner: number, costs: readonly number[], runtime: ContentRuntime): readonly (readonly number[])[];
  execute?(state: GameState, owner: number, costs: readonly number[], targets: readonly number[], runtime: ContentRuntime): void;
  readonly followup?: {
    actor(state: ReadonlyGameState, owner: number, targets: readonly number[]): number;
    options(state: ReadonlyGameState, owner: number, targets: readonly number[]): readonly { id: string; label: string }[];
    execute(state: GameState, owner: number, targets: readonly number[], choice: string): void;
  };
}
export interface SkillModifier {
  autoShan?(state: ReadonlyGameState, owner: number): boolean;
  suit?(state: ReadonlyGameState, owner: number, suit: import('../../catalog.ts').Suit): import('../../catalog.ts').Suit;
  survivesDying?(state: ReadonlyGameState, owner: number): boolean;
  responseCount?(state: ReadonlyGameState, owner: number, source: number, target: number,
    mode: 'sha' | 'juedou', current: number): number;
  targetEnabled?(state: ReadonlyGameState, owner: number, source: number, target: number, card: CardName): boolean;
  distance?(state: ReadonlyGameState, owner: number, from: number, to: number, current: number): number;
  attackRange?(state: ReadonlyGameState, owner: number, current: number): number;
  shaLimit?(state: ReadonlyGameState, owner: number, current: number): number;
  shaTargets?(state: ReadonlyGameState, owner: number, current: number): number;
  handLimit?(state: ReadonlyGameState, owner: number, current: number): number;
  trickDistanceLimit?(state: ReadonlyGameState, owner: number, card: CardName, current: number): number;
  rescueRecovery?(state: ReadonlyGameState, owner: number, rescuer: number, victim: number, current: number): number;
  skipDiscard?(state: ReadonlyGameState, owner: number): boolean;
  ignoresArmor?(state: ReadonlyGameState, owner: number): boolean;
  attackEffective?(state: ReadonlyGameState, owner: number, attack: AttackContext): boolean;
  trickEffective?(state: ReadonlyGameState, owner: number, card: CardName): boolean;
  damageReceived?(state: ReadonlyGameState, owner: number, context: import('../domain/resolution.ts').FrameData['damage'], current: number): number;
  damageAmount?(state: ReadonlyGameState, owner: number, target: number, card: number | CardLike | null, current: number): number;
}
export interface GeneralDefinition {
  readonly id: string;
  readonly label: string;
  readonly abilities: readonly string[];
  readonly sex?: 'male' | 'female';
  readonly group?: 'wei' | 'shu' | 'wu' | 'qun';
  readonly hp?: number;
}
export interface ContentPack {
  readonly id: string;
  readonly cards: readonly CardDefinition[];
  readonly skills: readonly SkillDefinition[];
  readonly generals: readonly GeneralDefinition[];
  readonly deck: readonly DeckEntry[];
}

/** Definitions are shared across games; only IDs and per-game data enter GameState. */
export class ContentRegistry {
  readonly #cards = new Map<CardName, CardDefinition>();
  readonly #skills = new Map<string, SkillDefinition>();
  readonly #generals = new Map<string, GeneralDefinition>();
  readonly deck: readonly DeckEntry[];
  constructor(packs: readonly ContentPack[]) {
    const packIds = new Set<string>();
    const deck: DeckEntry[] = [];
    for (const pack of packs) {
      if (!pack.id || packIds.has(pack.id)) throw new Error(`重复或空的内容包 ID：${pack.id}`);
      packIds.add(pack.id);
      for (const card of pack.cards) {
        if (this.#cards.has(card.id)) throw new Error(`重复的卡牌定义：${card.id}`);
        if (!card.id || !card.label?.trim()) throw new Error(`卡牌 ID 或中文名为空：${card.id}`);
        if (!card.play || !card.play.targeting) throw new Error(`卡牌缺少主动使用定义：${card.id}`);
        if ((card.kind === 'equip') !== Boolean(card.slot)) throw new Error(`装备槽与卡牌类型不匹配：${card.id}`);
        if (card.range !== undefined && (card.slot !== 'weapon' || !Number.isInteger(card.range) || card.range < 1)) {
          throw new Error(`武器射程无效：${card.id}`);
        }
        if (card.play.targeting === 'attack' && card.effect !== 'attack') throw new Error(`攻击出牌定义不匹配：${card.id}`);
        if (card.kind === 'equip' && card.effect !== 'equip') throw new Error(`装备效果定义不匹配：${card.id}`);
        if (card.kind === 'delay' && card.effect !== 'delay') throw new Error(`延时牌效果定义不匹配：${card.id}`);
        if (card.play.targeting === 'unplayable' && card.effect !== 'none') throw new Error(`不可主动使用的牌仍声明效果：${card.id}`);
        if (card.play.targeting === 'multiple' && (!Number.isInteger(card.play.maxTargets) || (card.play.maxTargets ?? 0) < 1 || (card.play.maxTargets ?? 0) > 8)) throw new Error(`多目标上限无效：${card.id}`);
        if (card.play.recast && card.play.targeting !== 'multiple') throw new Error(`重铸目标协议无效：${card.id}`);
        if (card.effect === 'custom' && !card.useEffect && !card.trickEffect) throw new Error(`自定义牌缺少效果处理器：${card.id}`);
        this.#cards.set(card.id, Object.freeze({ ...card, play: Object.freeze({ ...card.play }),
          abilities: Object.freeze([...(card.abilities ?? [])]) }));
      }
      for (const skill of pack.skills) {
        if (!skill.id || this.#skills.has(skill.id)) throw new Error(`重复或空的能力 ID：${skill.id}`);
        if (skill.active && Boolean(skill.active.costs) === Boolean(skill.active.selection)) {
          throw new Error(`主动技能必须选择一种费用协议：${skill.id}`);
        }
        if (skill.active && !skill.active.execute && !skill.active.followup) {
          throw new Error(`主动技能缺少效果：${skill.id}`);
        }
        if (skill.active?.selection && (!Number.isInteger(skill.active.selection.min) || skill.active.selection.min < 0 ||
          (skill.active.selection.max !== undefined && (!Number.isInteger(skill.active.selection.max) ||
            skill.active.selection.max < skill.active.selection.min)))) throw new Error(`主动技能费用范围无效：${skill.id}`);
        if (skill.trigger && skill.trigger.id !== skill.id) throw new Error(`触发定义 ID 不匹配：${skill.id}`);
        if (skill.transformation && skill.transformation.id !== skill.id) throw new Error(`转化定义 ID 不匹配：${skill.id}`);
        if (skill.transformations && skill.transformation) throw new Error(`不能同时声明单个与多个转化：${skill.id}`);
        for (const transformation of skill.transformations ?? []) {
          if (transformation.grantedBy !== skill.id) throw new Error(`转化授予能力不匹配：${skill.id}`);
        }
        this.#skills.set(skill.id, Object.freeze({
          ...skill,
          ...(skill.proxyResponse ? { proxyResponse: Object.freeze({ ...skill.proxyResponse }) } : {}),
          ...(skill.attackRedirect ? { attackRedirect: Object.freeze({ ...skill.attackRedirect }) } : {}),
          ...(skill.active ? { active: Object.freeze({ ...skill.active,
            ...(skill.active.selection ? { selection: Object.freeze({ ...skill.active.selection }) } : {}),
            ...(skill.active.followup ? { followup: Object.freeze({ ...skill.active.followup }) } : {}) }) } : {}),
          ...(skill.drawPhase ? { drawPhase: Object.freeze({ ...skill.drawPhase }) } : {}),
          ...(skill.startPhase ? { startPhase: Object.freeze({ ...skill.startPhase }) } : {}),
          ...(skill.endPhase ? { endPhase: Object.freeze({ ...skill.endPhase }) } : {}),
          ...(skill.trigger ? { trigger: Object.freeze({ ...skill.trigger }) } : {}),
          ...(skill.transformation ? { transformation: Object.freeze({ ...skill.transformation }) } : {}),
          ...(skill.transformations ? { transformations: Object.freeze(skill.transformations.map(item => Object.freeze({ ...item }))) } : {}),
          ...(skill.judgement ? { judgement: Object.freeze({ ...skill.judgement }) } : {}),
          ...(skill.attackJudgement ? { attackJudgement: Object.freeze({ ...skill.attackJudgement }) } : {}),
          ...(skill.skillJudgement ? { skillJudgement: Object.freeze({ ...skill.skillJudgement }) } : {}),
          ...(skill.modifier ? { modifier: Object.freeze({ ...skill.modifier }) } : {}),
        }));
      }
      for (const general of pack.generals) {
        if (!general.id || this.#generals.has(general.id)) throw new Error(`重复或空的武将 ID：${general.id}`);
        if (general.hp !== undefined && (!Number.isInteger(general.hp) || general.hp < 1)) throw new Error(`武将体力无效：${general.id}`);
        this.#generals.set(general.id, Object.freeze({ ...general, abilities: Object.freeze([...general.abilities]) }));
      }
      deck.push(...pack.deck.map(entry => ({ ...entry })));
    }
    for (const card of this.#cards.values()) for (const ability of card.abilities ?? []) this.requireSkill(ability);
    for (const general of this.#generals.values()) for (const ability of general.abilities) this.requireSkill(ability);
    for (const skill of this.#skills.values()) {
      if (skill.trigger?.grantedBy) this.requireSkill(skill.trigger.grantedBy);
      if (skill.transformation?.grantedBy) this.requireSkill(skill.transformation.grantedBy);
      for (const transformation of skill.transformations ?? []) if (transformation.grantedBy) this.requireSkill(transformation.grantedBy);
    }
    for (const entry of deck) {
      const definition = this.card(entry.name);
      if (entry.nature !== undefined && (!['normal', 'fire', 'thunder'].includes(entry.nature) || definition.effect !== 'attack')) {
        throw new Error(`卡牌伤害属性无效：${entry.name}`);
      }
      if (!Number.isInteger(entry.rank) || entry.rank < 1 || entry.rank > 13 ||
        !['spade', 'club', 'heart', 'diamond'].includes(entry.suit)) throw new Error(`牌堆实体无效：${entry.name}`);
    }
    this.deck = Object.freeze(deck.map(entry => Object.freeze(entry)));
  }
  card(id: CardName): CardDefinition {
    const definition = this.#cards.get(id);
    if (!definition) throw new Error(`未知卡牌定义：${id}`);
    return definition;
  }
  requireSkill(id: string): SkillDefinition {
    const definition = this.#skills.get(id);
    if (!definition) throw new Error(`未知能力定义：${id}`);
    return definition;
  }
  skillForTransformation(id: string): SkillDefinition {
    const skill = [...this.#skills.values()].find(candidate => candidate.transformation?.id === id ||
      candidate.transformations?.some(item => item.id === id));
    if (!skill) throw new Error(`未知转化定义：${id}`);
    return skill;
  }
  general(id: string): GeneralDefinition {
    const definition = this.#generals.get(id);
    if (!definition) throw new Error(`未知武将定义：${id}`);
    return definition;
  }
  generals(): readonly GeneralDefinition[] { return [...this.#generals.values()]; }
  skills(): readonly SkillDefinition[] { return [...this.#skills.values()]; }
  cards(): readonly CardDefinition[] { return [...this.#cards.values()]; }
}

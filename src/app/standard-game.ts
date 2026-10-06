import { contentForCards } from './game-content.ts';
import { NAMES, type Card, type CardPack } from "../../catalog.ts";
import { type Decision, type GameConfig, type Observation, type RuleSet, type TransitionSink } from "../../contracts.ts";
import { resolutionStack } from "../domain/resolution-stack.ts";
import { playOptions } from "../content/standard/action-generator.ts";
import { startTurn } from "../content/standard/flows/turn-flow.ts";
import { decision, legalActions, setPrompt } from "../core/decision-manager.ts";
import { observe } from "../core/observation-projector.ts";
import { EMPTY_EQUIP, copy } from "../domain/state-access.ts";
import { type GameState } from "../domain/state.ts";
import { draw } from "../rules/operations/cards.ts";
import { deckService } from "../rules/operations/deck-service.ts";
import { createStandardResolution } from './standard-resolution.ts';
import { standardModes } from './standard-modes.ts';
import { ModeRegistry } from '../rules/mode-registry.ts';
import { TriggerRegistry } from "../rules/trigger-registry.ts";
import { standardContent } from '../content/standard/content.ts';
import { ContentRegistry } from '../rules/content-registry.ts';
import { ContentRuntime } from '../rules/content-runtime.ts';
import { random } from '../rules/operations/random.ts';

export function createGame(config: GameConfig = {}, trace?: TransitionSink<GameState>, modes: ModeRegistry = standardModes, triggers: TriggerRegistry | undefined = undefined, content: ContentRegistry = contentForCards(config.cards)): GameState {
  const runtime = new ContentRuntime(content, triggers);
  const {
    seed = 1, players = [
      { label: "你", sex: "male" }, { label: "电脑", sex: "female" },
    ], initialHp = 4, deck = content.deck, first = 0,
  } = config;
  if (players.length < 2 || !Number.isInteger(first) || first < 0 || first >= players.length ||
      !Number.isInteger(seed) || !Number.isInteger(initialHp) || initialHp <= 0) throw new Error("对局参数无效");
  const mode = modes.get(config.mode ?? 'duel');
  const setupConfig = { ...config, players };
  mode.validateConfig(setupConfig);
  const cards: Record<number, Card> = {};
  const deckIds: number[] = [];
  deck.forEach((item, index) => {
    const definition = content.card(item.name);
    const id = index + 1;
    cards[id] = { ...item, id,
      ...(NAMES[item.name] === definition.label ? {} :
      { label: definition.label, kind: definition.kind, ...(definition.slot ? { slot: definition.slot } : {}) }) };
    deckIds.push(id);
  });
  const s: GameState = {
    cards, deck: deckIds, discard: [], table: [],
    players: players.map((p, id) => {
      const general = p.general ? content.general(p.general) : null;
      const hp = general?.hp ?? initialHp;
      return {
        id, label: p.label, sex: general?.sex ?? p.sex ?? "male", hp,
        maxHp: hp, alive: true, hand: [], equip: EMPTY_EQUIP(), judge: [],
        ...(general ? { general: general.id, ...(general.group ? { group: general.group } : {}) } : {}),
      };
    }),
    rng: (seed >>> 0) || 0x9e3779b9, active: first, turn: 0,
    phase: "setup", shaUsed: 0, resolution: resolutionStack.initial(), mode: { id: mode.id, roles: {}, knownTo: {} }, outcome: { status: 'ongoing' }, events: [], skipPlay: false,
  };
  const setup = mode.buildSetup(setupConfig, () => random(s));
  s.mode = setup.state;
  s.active = setup.first;
  for (const player of s.players) {
    player.maxHp += setup.hpBonus[player.id] ?? 0;
    player.hp = player.maxHp;
  }
  deckService.shuffle(s);
  for (const p of s.players) draw(s, p.id, 4);
  startTurn(s);
  trace?.({ type: "setup" }, copy(s));
  createStandardResolution(modes, runtime.triggers, runtime).scheduler.advance(s, trace);
  return s;
}

export function preparePlayScenario(s: GameState, actor: number, runtime: ContentRuntime = new ContentRuntime(standardContent)): GameState {
  const next = copy(s);
  next.active = actor;
  next.outcome = { status: 'ongoing' };
  next.resolution = resolutionStack.initial();
  resolutionStack.enqueue(next, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
  next.phase = "play";
  next.shaUsed = 0;
  setPrompt(next, actor, "play", "出牌阶段：选择行动", playOptions(next, runtime));
  return next;
}

export class StandardRuleset implements RuleSet<GameState> {
  readonly pack: CardPack;
  readonly #modes: ModeRegistry;
  readonly #triggers: TriggerRegistry;
  readonly #content: ContentRegistry;
  readonly #runtime: ContentRuntime;
  readonly #resolution: ReturnType<typeof createStandardResolution>;
  constructor(modes: ModeRegistry = standardModes, triggers?: TriggerRegistry, content: ContentRegistry = standardContent) {
    this.#modes = modes;
    this.#content = content;
    this.#runtime = new ContentRuntime(content, triggers);
    this.#triggers = this.#runtime.triggers;
    this.pack = { cards: content.deck, displayName: name => content.card(name).label };
    this.#resolution = createStandardResolution(modes, this.#triggers, this.#runtime);
  }
  isFinished(state: GameState): boolean { return state.outcome.status !== 'ongoing'; }
  create(config: GameConfig = {}, trace?: TransitionSink<GameState>) {
    if (config.cards && this.#content !== contentForCards(config.cards)) throw new Error('卡包配置与规则装配不一致');
    return createGame({ ...config, deck: config.deck ?? this.pack.cards }, trace, this.#modes, this.#triggers, this.#content);
  }
  decision(state: GameState): Decision | null { return decision(state); }
  observe(state: GameState, playerId: number): Observation { return observe(state, playerId); }
  legalActions(state: GameState) { return legalActions(state); }
  apply(state: GameState, choiceId: string, trace?: TransitionSink<GameState>) { return this.#resolution.choices.apply(state, choiceId, trace); }
}

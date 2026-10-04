import { resolutionStack } from '../../src/domain/resolution-stack.ts';
import assert from 'node:assert/strict';
import { createGame, preparePlayScenario } from '../../engine.ts';
import type { GameConfig } from '../../contracts.ts';
import type { EquipSlot, GameState } from '../../src/domain/state.ts';

/** Test-only owner of initial state setup. Runtime queues stay out of rule cases. */
export class ScenarioBuilder {
  readonly state: GameState;
  constructor(count = 2, config: GameConfig = {}) {
    this.state = createGame({ seed: 3, players: Array.from({ length: count }, (_, index) => ({
      label: `角色${index + 1}`, sex: index % 2 === 0 ? 'male' as const : 'female' as const,
    })), ...config });
    const state = this.state;
    state.players.forEach(player => {
      player.hand = [];
      player.equip = { weapon: null, armor: null, plusHorse: null, minusHorse: null };
      player.judge = [];
    });
    state.deck = Object.keys(state.cards).map(Number);
    state.discard = [];
    state.table = [];
    state.resolution = resolutionStack.initial();
    state.events = [];
  }
  take(name: string, suit?: string, rank?: number): number {
    const id = this.state.deck.find(id => {
      const card = this.state.cards[id];
      return card.name === name && (!suit || card.suit === suit) && (!rank || card.rank === rank);
    });
    assert.ok(id, `找不到牌：${name}`);
    this.state.deck.splice(this.state.deck.indexOf(id), 1);
    return id;
  }
  hand(player: number, name: string, suit?: string, rank?: number): number {
    const id = this.take(name, suit, rank);
    this.state.players[player].hand.push(id);
    return id;
  }
  equip(player: number, name: string, slot: EquipSlot): number {
    const id = this.take(name);
    this.state.players[player].equip[slot] = id;
    return id;
  }
  top(name: string, suit?: string, rank?: number): number {
    const id = this.take(name, suit, rank);
    this.state.deck.push(id);
    return id;
  }
  start(actor = 0): GameState { return preparePlayScenario(this.state, actor); }
}
export const fixture = (count = 2, config: GameConfig = {}): ScenarioBuilder => new ScenarioBuilder(count, config);

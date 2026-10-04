import standardDeck from './standard-deck.json' with { type: 'json' };
import { STANDARD_CARD_SPECS } from './src/content/standard/card-specs.ts';

export type StandardCardName = (typeof STANDARD_CARD_SPECS)[number]['id'];
export type CardName = string;
export const NAMES = Object.freeze(Object.fromEntries(STANDARD_CARD_SPECS.map(card => [card.id, card.label])) as Record<CardName, string>);
export type Suit = "spade" | "club" | "heart" | "diamond";
export interface Card {
  id: number;
  name: CardName;
  suit: Suit;
  rank: number;
  /** Present when a registered pack adds a name outside the standard catalog. */
  label?: string;
  kind?: 'basic' | 'trick' | 'delay' | 'equip';
  slot?: 'weapon' | 'armor' | 'plusHorse' | 'minusHorse';
}
export interface VirtualCard {
  name: CardName;
  suit: Suit | null;
  color?: "red" | "black" | "none";
  virtual: true;
}
export type CardLike = Card | VirtualCard;
export type DeckEntry = Omit<Card, "id">;
export interface CardPack {
  readonly cards: readonly DeckEntry[];
  displayName(name: CardName): string;
}
export const STANDARD_DECK = standardDeck as DeckEntry[];
if (STANDARD_DECK.length !== 108) throw new Error("标准牌堆必须有108张牌");

export class StandardCardPack implements CardPack {
  readonly cards: readonly DeckEntry[] = STANDARD_DECK;
  displayName(name: CardName): string { return NAMES[name]; }
}

const byName = Object.fromEntries(STANDARD_CARD_SPECS.map(card => [card.id, card])) as Partial<Record<CardName, (typeof STANDARD_CARD_SPECS)[number]>>;
export const WEAPON_RANGE: Partial<Record<CardName, number>> = Object.freeze(Object.fromEntries(
  STANDARD_CARD_SPECS.filter(card => 'range' in card).map(card => [card.id, 'range' in card ? card.range : 0])));
export const ARMORS: ReadonlySet<CardName> = new Set(STANDARD_CARD_SPECS.filter(card => 'slot' in card && card.slot === 'armor').map(card => card.id));
export const PLUS_HORSES: ReadonlySet<CardName> = new Set(STANDARD_CARD_SPECS.filter(card => 'slot' in card && card.slot === 'plusHorse').map(card => card.id));
export const MINUS_HORSES: ReadonlySet<CardName> = new Set(STANDARD_CARD_SPECS.filter(card => 'slot' in card && card.slot === 'minusHorse').map(card => card.id));
export const DELAYS: ReadonlySet<CardName> = new Set(STANDARD_CARD_SPECS.filter(card => card.kind === 'delay').map(card => card.id));
export const BASICS: ReadonlySet<CardName> = new Set(STANDARD_CARD_SPECS.filter(card => card.kind === 'basic').map(card => card.id));
export const TRICKS: ReadonlySet<CardName> = new Set(STANDARD_CARD_SPECS.filter(card => card.kind === 'trick').map(card => card.id));

export function cardType(name: CardName): "basic" | "trick" | "delay" | "equip" {
  const definition = byName[name];
  if (!definition) throw new Error(`未知标准牌：${name}`);
  return definition.kind;
}
export function equipSlot(name: CardName): "weapon" | "armor" | "plusHorse" | "minusHorse" {
  const definition = byName[name];
  if (definition && 'slot' in definition) return definition.slot;
  throw new Error(`不是装备牌：${name}`);
}
export function cardTypeOf(card: Card): 'basic' | 'trick' | 'delay' | 'equip' {
  return card.kind ?? cardType(card.name);
}
export function equipSlotOf(card: Card): 'weapon' | 'armor' | 'plusHorse' | 'minusHorse' {
  return card.slot ?? equipSlot(card.name);
}
export function cardColor(card: CardLike): "red" | "black" | "none" {
  if ("color" in card && card.color) return card.color;
  if (!card.suit) return "none";
  return card.suit === "heart" || card.suit === "diamond" ? "red" : "black";
}
export function cardText(card: Card): string {
  const suit = { spade: "♠", club: "♣", heart: "♥", diamond: "♦" }[card.suit];
  const rank = ({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[card.rank] ?? card.rank;
  const name = card.label ?? NAMES[card.name];
  if (!name || !suit) throw new Error("卡牌中文映射缺失");
  return `【${name}】${suit}${rank}`;
}

import { resolutionStack } from "./resolution-stack.ts";
import { seatService } from "./seat-service.ts";
import { type Card, type CardName } from "../../catalog.ts";
import { type EquipSlot, type Equipment, type GameState, type PlayerState, type Task } from "./state.ts";

export const EMPTY_EQUIP = (): Equipment => ({ weapon: null, armor: null, plusHorse: null, minusHorse: null });

export const copy = <T>(value: T): T => structuredClone(value);

export const card = (s: GameState, id: number): Card => s.cards[id];

export function name(s: GameState, id: number): CardName;
export function name(s: GameState, id: number | null): CardName | null;
export function name(s: GameState, id: number | null): CardName | null {
  return id ? s.virtualJudgeNames?.find(item => item.card === id)?.name ?? card(s, id).name : null;
}

export const person = (s: GameState, id: number): PlayerState => s.players[id];

export const alive = (s: GameState): number[] => s.players.filter(p => p.alive).map(p => p.id);

export const equipName = (s: GameState, id: number, slot: EquipSlot): CardName | null => name(s, person(s, id).equip[slot]);

export const push = (s: GameState, ...tasks: Task[]): number => resolutionStack.enqueue(s, ...tasks);

export function nextAlive(s: GameState, id: number): number {
  // Compatibility for terminal states; new callers can use nextLiving's explicit null.
  return seatService.nextLiving(s, id) ?? id;
}

export function seatOrder(s: GameState, id: number): number[] {
  return seatService.livingOrder(s, id);
}

export function stealable(s: GameState, id: number): number[] {
  const p = person(s, id);
  return [...p.hand, ...Object.values(p.equip).filter((value): value is number => value !== null), ...p.judge];
}

export function handAndEquip(s: GameState, id: number): number[] {
  const p = person(s, id);
  return [...p.hand, ...Object.values(p.equip).filter((value): value is number => value !== null)];
}

export function handCards(s: GameState, id: number, cardName: CardName): number[] {
  return person(s, id).hand.filter(cid => name(s, cid) === cardName);
}

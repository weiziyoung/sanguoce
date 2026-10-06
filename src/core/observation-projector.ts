import { projectEvent } from "./event-projector.ts";
import { formatEvent } from "../presentation/event-formatter.ts";
import type { VisibleEvent } from "../domain/events.ts";
import { resolutionStack } from "../domain/resolution-stack.ts";
import { type Observation } from "../../contracts.ts";
import type { Card } from '../../catalog.ts';
import { card, copy, person } from "../domain/state-access.ts";
import { type GameState, type PlayerState } from "../domain/state.ts";

export function observe(s: GameState, playerId: number): Observation {
  const frame = resolutionStack.current(s);
  const nullify = frame?.kind === 'nullification' && frame.data.result === null ? frame.data : null;
  const own = person(s, playerId);
  const others = s.players.filter(p => p.id !== playerId);
  const visible = (p: PlayerState) => ({
    id: p.id, label: p.label, sex: p.sex, ...(p.general ? { general: p.general } : {}),
    ...(p.group ? { group: p.group } : {}),
    hp: p.hp, maxHp: p.maxHp, alive: p.alive,
    handCount: p.hand.length,
    ...(p.chained === undefined ? {} : { chained: p.chained }),
    ...(p.drunk ? { drunk: p.drunk } : {}),
    ...(s.mode.knownTo[p.id]?.includes(playerId) && s.mode.roles[p.id]
      ? { role: s.mode.roles[p.id] } : {}),
    equip: Object.fromEntries(Object.entries(p.equip).map(([slot, id]) => [slot, id ? copy(card(s, id as number)) : null])),
    judge: p.judge.map((id: number) => copy(card(s, id))),
  });
  const events: VisibleEvent[] = [];
  const eventCards: Record<number, Card> = {};
  const log: string[] = [];
  for (let i = s.events.length - 1; i >= 0 && (events.length < 30 || log.length < 12); i--) {
    const event = projectEvent(s.events[i], playerId);
    if (!event) continue;
    if (events.length < 30) {
      events.unshift(event);
      const publicCardIds = (() => {
        switch (event.kind) {
          case 'cardRevealed': case 'cardRecast': case 'cardUsed': case 'discarded': case 'equipped': case 'judged':
          case 'delayPlaced': case 'harvestTaken': case 'harvestLeftover': case 'duelResponded':
          case 'nullificationUsed': return [event.data.card];
          case 'harvestRevealed': return event.data.cards;
          case 'judgementReplaced': return [event.data.oldCard, event.data.newCard];
          case 'gained': return event.data.card === null ? [] : [event.data.card];
          default: return [];
        }
      })();
      for (const id of publicCardIds) if (s.cards[id]) eventCards[id] = copy(s.cards[id]);
    }
    const line = formatEvent(event, s);
    if (line !== null && log.length < 12) log.unshift(line);
  }
  return {
    events,
    eventCards,
    mode: { id: s.mode.id },
    turn: s.turn, phase: s.phase, active: s.active, actor: frame?.prompt?.actor ?? null,
    self: { ...visible(own), hand: own.hand.map(id => copy(card(s, id))) },
    others: others.map(visible), deckCount: s.deck.length,
    discardCount: s.discard.length, discardTop: s.discard.length ? copy(card(s, s.discard.at(-1)!)) : null,
    ...(s.jiuUsed === undefined ? {} : { jiuUsed: s.jiuUsed }),
    table: s.table.map(id => copy(card(s, id))), shaUsed: s.shaUsed,
    nullify: nullify ? {
      source: nullify.source, target: nullify.target,
      cname: nullify.cname, parity: nullify.parity,
      ...(Object.values(s.cards).find(card => card.name === nullify.cname)?.label
        ? { cardLabel: Object.values(s.cards).find(card => card.name === nullify.cname)!.label } : {}),
    } : null,
    log, outcome: copy(s.outcome),
  };
}

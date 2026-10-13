import assert from 'node:assert/strict';
import { fixture } from './scenario-builder.ts';
import { contentForCards, type CardSet } from '../../src/app/game-content.ts';
import { ContentRuntime } from '../../src/rules/content-runtime.ts';
import { createStandardResolution } from '../../src/app/standard-resolution.ts';
import { standardModes } from '../../src/app/standard-modes.ts';
import { preparePlayScenario, StandardRuleset } from '../../src/app/standard-game.ts';
import { decision, legalActions } from '../../src/core/decision-manager.ts';
import type { ActionData, GameState, Task } from '../../src/domain/state.ts';
import { resolutionStack } from '../../src/domain/resolution-stack.ts';
export function mountainScene(count = 2, cards: CardSet = 'standard', identity = false) {
  const f = fixture(count, { cards, generalPacks: ['wind', 'fire', 'forest', 'mountain'], ...(identity ? { mode: 'identity', roles: count === 5 ? ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] : ['lord', 'rebel'] } : {}) });
  const content = contentForCards(cards, ['wind', 'fire', 'forest', 'mountain']), runtime = new ContentRuntime(content);
  const resolution = createStandardResolution(standardModes, runtime.triggers, runtime);
  const rules = new StandardRuleset(undefined, undefined, content);
  const general = (seat: number, id: string) => { const d = content.general(id); Object.assign(f.state.players[seat], { general: id, group: d.group, sex: d.sex, hp: d.hp, maxHp: d.hp }); };
  const choose = (s: GameState, predicate: (data: ActionData) => boolean) => {
    const option = legalActions(s).find(o => o.data && predicate(o.data));
    assert.ok(option, `缺少选项：${decision(s)?.kind} ${JSON.stringify(legalActions(s).map(o => o.data))}`);
    return rules.apply(s, option.id);
  };
  const advance = (s: GameState) => { resolution.scheduler.advance(s); return s; };
  const tasks = (...steps: Task[]) => { resolutionStack.enqueue(f.state, ...steps); return advance(f.state); };
  const passResponses = (s: GameState) => { let n = 0; while (['respond', 'nullify'].includes(decision(s)?.kind ?? '') && n++ < 30) s = choose(s, d => d.type === 'pass'); return s; };
  return { f, content, runtime, rules, general, choose, advance, tasks, passResponses, start: (actor = 0) => preparePlayScenario(f.state, actor, runtime) };
}
export function conserved(s: GameState) {
  const ids = [...s.deck, ...s.discard, ...s.table, ...s.players.flatMap(p => [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null), ...Object.values(p.piles ?? {}).flat()])];
  assert.equal(ids.length, Object.keys(s.cards).length); assert.equal(new Set(ids).size, ids.length);
}

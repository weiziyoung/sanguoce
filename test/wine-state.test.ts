import test from 'node:test';
import assert from 'node:assert/strict';
import { StandardRuleset, preparePlayScenario } from '../engine.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { vitals } from '../src/rules/operations/vitals-service.ts';
import { applyWinePortraitTint, portraitStatus, winePortraitUpdate, WINE_PORTRAIT_TINT } from '../src/web/portrait-wine.ts';
import { ChineseView } from '../chinese-view.ts';
import { fixture } from './support/scenario-builder.ts';

const rules = new StandardRuleset(undefined, undefined, expandedContent);
const start = (f: ReturnType<typeof fixture>) => preparePlayScenario(f.state, 0, new ContentRuntime(expandedContent));
function passResponse(state: ReturnType<typeof start>) {
  while (rules.decision(state)?.kind === 'respond') state = rules.apply(state, 'respond:pass');
  return state;
}

test('连弩连续两次命中仅首张杀获得酒加成，串行化恢复后仍正确，状态消费只发生一次', () => {
  const f = fixture(2, { cards: 'junzheng' });
  f.equip(0, 'zhuge', 'weapon');
  const wine = f.hand(0, 'jiu'), first = f.hand(0, 'sha'), second = f.hand(0, 'sha');
  let state = rules.apply(start(f), `play:${wine}`);
  assert.equal(rules.observe(state, 0).self.drunk, 1);
  assert.match(new ChineseView().stateForDecision(rules.observe(state, 0), rules.decision(state)!), /已饮酒：本回合下一张【杀】伤害\+1/);
  state = rules.apply(JSON.parse(JSON.stringify(state)), `play:${first}:1`);
  assert.equal(state.players[0].drunk, undefined);
  state = passResponse(state);
  state = passResponse(rules.apply(state, `play:${second}:1`));
  const damage = state.events.filter(event => event.kind === 'damaged');
  assert.deepEqual(damage.map(event => event.data.amount), [2, 1]);
  assert.equal(state.players[1].hp, 1);
  assert.equal(state.events.filter(event => event.kind === 'wineCleared').length, 1);
});

test('决斗伤害不消耗也不享受酒，随后本回合的杀才携带加成', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const wine = f.hand(0, 'jiu'), duel = f.hand(0, 'juedou'), sha = f.hand(0, 'sha');
  let state = rules.apply(start(f), `play:${wine}`);
  state = rules.apply(state, `play:${duel}:1`);
  while (rules.decision(state)?.kind === 'nullify') state = rules.apply(state, 'nullify-pass');
  state = passResponse(state);
  assert.equal(state.players[1].hp, 3);
  assert.equal(state.players[0].drunk, 1);
  state = passResponse(rules.apply(state, `play:${sha}:1`));
  assert.deepEqual(state.events.filter(event => event.kind === 'damaged').map(event => event.data.amount), [1, 2]);
});

test('同一张方天杀的三个目标共享酒加成，消费事件仍只有一次', () => {
  const f = fixture(5, { cards: 'junzheng', mode: 'identity', roles: ['lord','rebel','rebel','renegade','loyalist'] });
  f.equip(0, 'fangtian', 'weapon');
  const wine = f.hand(0, 'jiu'), sha = f.hand(0, 'sha');
  let state = rules.apply(start(f), `play:${wine}`);
  state = passResponse(rules.apply(state, `play:${sha}:1:2:3`));
  assert.deepEqual(state.events.filter(event => event.kind === 'damaged').map(event => event.data.amount), [2, 2, 2]);
  assert.equal(state.events.filter(event => event.kind === 'wineCleared').length, 1);
});

test('没有使用杀时酒状态在回合结束清除，死亡也清除，并通过可见事件通知画像', () => {
  const f = fixture(2, { cards: 'junzheng' });
  const wine = f.hand(0, 'jiu');
  let state = rules.apply(start(f), `play:${wine}`);
  const used = state.events.find(event => event.kind === 'wineUsed')!;
  assert.deepEqual(winePortraitUpdate(used), { player: 0, active: true });
  state = rules.apply(state, 'end-play');
  assert.equal(state.players[0].drunk, undefined);
  const cleared = rules.observe(state, 0).events.find(event => event.kind === 'wineCleared')!;
  assert.deepEqual(winePortraitUpdate(cleared), { player: 0, active: false });
  assert.equal(cleared.kind === 'wineCleared' && cleared.data.reason, 'turnEnd');
  const g = fixture(2, { cards: 'junzheng' });
  g.state.players[1].drunk = 1;
  vitals.markDead(g.state, 1, 0);
  assert.equal(g.state.players[1].drunk, undefined);
  assert.equal(g.state.events.find(event => event.kind === 'wineCleared')?.data.reason, 'death');
});

test('画像饮酒时施加红色滤镜，消耗时恢复；无原画占位也支持，状态标签与连环并存', () => {
  const calls: unknown[] = [];
  const art = { setTint: (color: number) => calls.push(color), clearTint: () => calls.push('clear') };
  applyWinePortraitTint(art, true);
  applyWinePortraitTint(art, false);
  assert.deepEqual(calls, [WINE_PORTRAIT_TINT, 'clear']);
  const placeholder = { setFillStyle: (color: number) => calls.push(color) };
  applyWinePortraitTint(placeholder, true);
  applyWinePortraitTint(placeholder, false);
  assert.deepEqual(calls.slice(-2), [0x783838, 0x263d32]);
  assert.equal(portraitStatus(true, true), '连环 · 酒＋1');
  assert.equal(portraitStatus(true, false), '连环');
  assert.deepEqual(winePortraitUpdate({ id: 1, kind: 'died', data: { target: 0 } }), { player: 0, active: false });
});

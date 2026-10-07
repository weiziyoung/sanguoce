import test from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, observe, preparePlayScenario, StandardRuleset } from '../engine.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { portraitChainLinks, portraitChainUpdate } from '../src/web/portrait-chain.ts';
import { fixture } from './support/scenario-builder.ts';

test('各模式画像的锁链闭合环绕四边，转角平滑，链节间距一致', () => {
  for (const [width, height] of [[196, 194], [196, 214], [172, 214], [204, 214], [204, 260]]) {
    const links = portraitChainLinks(width, height);
    assert.ok(links.length > 55);
    for (const edge of [
      (p: { x: number; y: number }) => p.x === -width / 2,
      (p: { x: number; y: number }) => p.x === width / 2,
      (p: { x: number; y: number }) => p.y === -height / 2,
      (p: { x: number; y: number }) => p.y === height / 2,
    ]) assert.ok(links.some(edge));
    links.forEach((link, i) => {
      assert.ok(Math.abs(link.x) <= width / 2 && Math.abs(link.y) <= height / 2);
      assert.ok(Number.isFinite(link.angle));
      const next = links[(i + 1) % links.length];
      const gap = Math.hypot(link.x - next.x, link.y - next.y);
      assert.ok(gap > 10 && gap < 13, `闭环链节间距异常：${gap}`);
    });
  }
});

test('锁链按真实公开事件出现与解除，属性伤害同步解链，重绘观察仍一致', () => {
  const f = fixture(3, { cards: 'junzheng' });
  const chain = f.hand(0, 'tiesuo');
  const fire = f.hand(0, 'sha', 'heart', 4);
  assert.equal(f.state.cards[fire].nature, 'fire');
  const rules = new StandardRuleset(undefined, undefined, expandedContent);
  let state = preparePlayScenario(f.state, 0, new ContentRuntime(expandedContent));
  const shown = new Map<number, boolean>([[0, false], [1, false], [2, false]]);
  let last = Math.max(0, ...observe(state, 0).events.map(event => event.id));
  const update = () => {
    const events = observe(state, 0).events.filter(event => event.id > last);
    for (const event of events) {
      const chain = portraitChainUpdate(event);
      if (chain) shown.set(chain.player, chain.visible);
    }
    last = Math.max(last, ...events.map(event => event.id));
    const obs = observe(state, 0);
    for (const player of [obs.self, ...obs.others])
      assert.equal(shown.get(player.id), Boolean(player.alive && player.chained));
  };
  state = rules.apply(state, `play:${chain}:0:1`);
  update();
  assert.equal(shown.get(0), true);
  assert.equal(shown.get(1), true);
  assert.equal(shown.get(2), false);
  state = rules.apply(state, `play:${fire}:1`);
  const pass = legalActions(state).find(action => action.data?.type === 'pass');
  assert.ok(pass);
  state = rules.apply(state, pass.id);
  update();
  assert.equal(shown.get(0), false);
  assert.equal(shown.get(1), false);
  assert.deepEqual(portraitChainUpdate({ id: 999, kind: 'died', data: { target: 1, source: 0 } }),
    { player: 1, visible: false });
});

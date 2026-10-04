import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, decision, observe } from '../engine.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { TableHud } from '../src/web/hud.ts';
import { fixture } from './support/scenario-builder.ts';

function guanshiChoice(count = 2, withHand = true) {
  const f = fixture(count, count === 5 ? { mode: 'identity' } : {});
  const sha = f.take('sha');
  const weapon = f.equip(0, 'guanshi', 'weapon');
  const equipIds = [f.equip(0, 'bagua', 'armor'), f.equip(0, 'jueying', 'plusHorse'), f.equip(0, 'dawan', 'minusHorse')];
  const hands = withHand ? [f.hand(0, 'shan'), f.hand(0, 'tao')] : [];
  f.equip(1, 'hanbing', 'weapon');
  f.equip(1, 'dilu', 'plusHorse');
  f.hand(1, 'tao');
  f.state.players[0].judge.push(f.take('lebu'));
  const runtime = new ContentRuntime(standardContent);
  resolutionStack.enqueue(f.state, { kind: 'openTriggers', signal: {
    kind: 'attackMissed', data: { source: 0, target: 1, sha, ignoreDistance: false },
  }, then: [] });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  const prompt = decision(f.state)!;
  assert.equal(prompt.kind, 'guanshi');
  return { state: f.state, prompt, weapon, equipIds, hands };
}

for (const count of [2, 5]) {
  test(`${count} 人贯石斧在桌面逐张展开合法装备原牌，费用组合不重复展示装备`, () => {
    const { state, prompt, equipIds, weapon } = guanshiChoice(count);
    const model = new TableInteraction(prompt);
    const picks = zonePickerChoices(observe(state, 0), model);
    assert.deepEqual(picks.map(pick => pick.card?.id), equipIds);
    assert.ok(picks.every(pick => pick.zone === 'equip' && pick.choice.actionType === 'guanshi'));
    assert.ok(picks.every(pick => !pick.choice.zone), '双牌费用不能当成单击立即提交的牌区动作');
    assert.ok(!picks.some(pick => pick.card?.id === weapon), '贯石斧自身不在合法费用里');
    for (const pick of picks) assert.deepEqual(pick.card, state.cards[pick.card!.id]);
  });

  test(`${count} 人贯石斧支持两张手牌、手牌加装备、两张装备，确认前不弃牌`, () => {
    const { state, prompt, weapon } = guanshiChoice(count);
    const original = observe(state, 0);
    for (const cost of new TableInteraction(prompt).leaves.filter(choice => choice.actionType === 'guanshi')) {
      const model = new TableInteraction(prompt);
      for (const id of [...cost.cardIds].reverse()) assert.equal(model.selectCard(id), true);
      assert.deepEqual(model.exact.map(choice => choice.id), [cost.id]);
      assert.deepEqual(observe(state, 0), original);
      const result = apply(state, model.exact[0].id);
      assert.ok(cost.cardIds.every(id => result.discard.includes(id)));
      assert.equal(result.players[0].equip.weapon, weapon);
      assert.equal(result.players[1].hp, 3, '弃置两张费用后杀继续命中');
      assert.notEqual(decision(result)?.kind, 'guanshi');
    }
  });
}

test('贯石斧费用最多选择两张，可取消、更换装备或撤销，并可放弃发动', () => {
  const { state, prompt, equipIds, hands } = guanshiChoice();
  const model = new TableInteraction(prompt);
  model.selectCard(equipIds[0]);
  assert.equal(model.exact.length, 0);
  model.selectCard(hands[0]);
  assert.equal(model.selectCard(equipIds[1]), false);
  assert.deepEqual(model.cards, [equipIds[0], hands[0]]);
  model.selectCard(hands[0]);
  model.selectCard(equipIds[1]);
  assert.deepEqual(model.exact[0].cardIds.sort(), equipIds.slice(0, 2).sort());
  model.clear();
  assert.deepEqual(model.cards, []);
  const pass = model.leaves.find(choice => choice.actionType === 'pass')!;
  const skipped = apply(state, pass.id);
  assert.deepEqual(observe(skipped, 0).self.equip, observe(state, 0).self.equip);
  assert.equal(skipped.players[1].hp, 4);
});

test('贯石斧无手牌时仍可从桌面选两件装备支付费用', () => {
  const { state, prompt } = guanshiChoice(2, false);
  const model = new TableInteraction(prompt);
  const picks = zonePickerChoices(observe(state, 0), model);
  assert.equal(picks.length, 3);
  picks.slice(0, 2).forEach(pick => model.selectCard(pick.card!.id));
  assert.equal(model.exact.length, 1);
  assert.equal(apply(state, model.exact[0].id).players[1].hp, 3);
});

test('贯石斧 HUD 显示混选提示，选足两张才允许确认，确认提交原始双牌动作', () => {
  class Node {
    textContent = '';
    disabled = false;
    onclick?: () => void;
    classList = { remove() {}, toggle() {} };
    replaceChildren() {}
    append() {}
  }
  const nodes = new Map<string, Node>();
  const get = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new Node());
    return nodes.get(id)!;
  };
  const prior = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: get, createElement: () => new Node() } });
  try {
    const { state, prompt, equipIds, hands } = guanshiChoice();
    const model = new TableInteraction(prompt);
    const submitted: string[] = [];
    const hud = new TableHud();
    const render = () => hud.render(observe(state, 0), model, false, [],
      choice => submitted.push(choice.id), () => {}, () => model.clear(), choice => model.scope(choice));
    render();
    assert.match(get('prompt').textContent, /贯石斧.*0\/2/);
    assert.equal(get('play-action').disabled, true);
    assert.equal(get('end-action').textContent, '不发动');
    model.selectCard(equipIds[0]); render();
    assert.match(get('prompt').textContent, /1\/2/);
    assert.equal(get('play-action').disabled, true);
    model.selectCard(hands[0]); render();
    assert.equal(get('play-action').textContent, '确认弃牌');
    assert.equal(get('play-action').disabled, false);
    assert.deepEqual(submitted, []);
    get('play-action').onclick!();
    assert.deepEqual(submitted, [model.exact[0].id]);
    assert.equal(apply(state, submitted[0]).players[1].hp, 3);
  } finally { Object.assign(globalThis, { document: prior }); }
});

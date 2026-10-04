import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, observe } from '../engine.ts';
import { decision } from '../src/core/decision-manager.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { contextActionChoices, TableHud } from '../src/web/hud.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { StrategicPolicy as FrozenPolicy } from '../src/policies/versions/v5/strategic-policy.ts';
import { fixture } from './support/scenario-builder.ts';

function drawChoice(count = 5, eligible = [1, 2, 3, 4], dead: number[] = []) {
  const f = fixture(count, count === 5 ? { mode: 'identity' } : {});
  f.state.players[0].general = 'standard.zhangliao';
  f.hand(0, 'sha');
  for (const id of eligible) f.hand(id, 'shan');
  for (const id of dead) f.state.players[id].alive = false;
  f.state.active = 0;
  resolutionStack.enqueue(f.state, { kind: 'phaseDraw' }, { kind: 'phasePlay' });
  const runtime = new ContentRuntime(standardContent);
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  const prompt = decision(f.state)!;
  assert.equal(prompt.kind, 'phaseDrawChoice');
  return { state: f.state, prompt, model: new TableInteraction(prompt) };
}

test('突袭第一步只有发动／正常摸牌，点击发动前不能选择目标且不会获得牌', () => {
  const { state, model } = drawChoice();
  assert.equal(model.leaves.length, 11, '引擎仍保留全部合法的单人／双人候选');
  assert.deepEqual(contextActionChoices(model).map(choice => choice.label), ['发动突袭', '正常摸两张牌']);
  assert.deepEqual(model.nextTargets, []);
  assert.equal(model.selectTarget(1), false);
  assert.deepEqual(model.selectableCards, []);
  model.scope(model.tuxiIntent!);
  assert.deepEqual(contextActionChoices(model), []);
  assert.deepEqual(model.nextTargets.sort(), [1, 2, 3, 4]);
  assert.equal(model.exact.length, 0, '零目标不能确认');
  assert.equal(state.players[0].hand.length, 1, '进入选人界面不提交引擎选择');
});

test('双人目标可逆序点选，最多两人，确认提交原始合法选项', () => {
  const { state, model } = drawChoice();
  model.scope(model.tuxiIntent!);
  assert.equal(model.selectTarget(4), true);
  assert.equal(model.exact.length, 1, '一名目标也可以确认');
  assert.deepEqual(model.nextTargets.sort(), [1, 2, 3]);
  assert.equal(model.selectTarget(1), true);
  assert.deepEqual(model.targets, [4, 1]);
  assert.equal(model.exact.length, 1);
  assert.deepEqual(model.exact[0].targetIds, [1, 4]);
  assert.deepEqual(model.nextTargets, []);
  assert.equal(model.selectTarget(2), false);
  assert.equal(state.players[0].hand.length, 1);
  const result = apply(state, model.exact[0].id);
  assert.equal(result.players[0].hand.length, 3);
  assert.equal(result.players[1].hand.length, 0);
  assert.equal(result.players[4].hand.length, 0);
  assert.equal(result.players[2].hand.length, 1);
  assert.equal(result.players[3].hand.length, 1);
});

test('再次点选取消目标，返回第一步可改选正常摸两张', () => {
  const { state, model } = drawChoice();
  model.scope(model.tuxiIntent!);
  model.selectTarget(3); model.selectTarget(1);
  assert.equal(model.selectTarget(3), true);
  assert.deepEqual(model.targets, [1]);
  assert.deepEqual(model.exact[0].targetIds, [1]);
  model.clear();
  assert.equal(model.tuxiActive, false);
  assert.deepEqual(model.targets, []);
  assert.equal(contextActionChoices(model).length, 2);
  const result = apply(state, model.normalDrawChoice!.id);
  assert.equal(result.players[0].hand.length, 3);
  assert.ok(result.players.slice(1).every(player => player.hand.length === 1));
});

test('对决只有一名可选目标时，仍先选发动，再点目标确认', () => {
  const { state, model } = drawChoice(2, [1]);
  assert.equal(model.tuxiIntent!.children.length, 1);
  assert.equal(model.selectTarget(1), false);
  model.scope(model.tuxiIntent!);
  assert.equal(model.exact.length, 0);
  model.selectTarget(1);
  assert.equal(model.selectTarget(0), false);
  const result = apply(state, model.exact[0].id);
  assert.equal(result.players[0].hand.length, 2);
  assert.equal(result.players[1].hand.length, 0);
});

test('没有手牌或已死亡的角色不成为突袭目标，操作不依赖候选的中文标签', () => {
  const { state, prompt } = drawChoice(5, [2, 4], [4]);
  const model = new TableInteraction({ ...prompt, options: prompt.options.map(choice => ({ ...choice, label: '任意文案' })) });
  model.scope(model.tuxiIntent!);
  assert.deepEqual(model.nextTargets, [2]);
  assert.equal(model.selectTarget(1), false);
  assert.equal(model.selectTarget(3), false);
  assert.equal(model.selectTarget(4), false);
  assert.ok(observe(state, 0).others.every(player => !('hand' in player)), '仅使用公开的可选目标，不读取暗手牌');
});

test('HUD 发动按钮进入选人，零目标禁用确认，确认及返回按钮使用正确回调', () => {
  class FakeNode {
    children: FakeNode[] = [];
    textContent = '';
    disabled = false;
    classes = new Set<string>();
    onclick?: () => void;
    classList = {
      remove: (name: string) => { this.classes.delete(name); },
      toggle: (name: string, enabled: boolean) => { if (enabled) this.classes.add(name); else this.classes.delete(name); },
    };
    append(...children: FakeNode[]) { this.children.push(...children); }
    replaceChildren(...children: FakeNode[]) { this.children = children; }
  }
  const nodes = new Map<string, FakeNode>();
  const get = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new FakeNode());
    return nodes.get(id)!;
  };
  const prior = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: get, createElement: () => new FakeNode() } });
  try {
    const { state, model } = drawChoice();
    const hud = new TableHud();
    const submitted: string[] = [];
    const render = () => hud.render(observe(state, 0), model, false, [],
      choice => submitted.push(choice.id), () => {}, () => model.clear(), choice => model.scope(choice));
    render();
    assert.equal(get('context-actions').children.length, 2);
    assert.ok(get('action-bar').classes.has('hidden'));
    get('context-actions').children[0].onclick!();
    assert.equal(model.tuxiActive, true);
    assert.deepEqual(submitted, []);
    render();
    assert.equal(get('context-actions').children.length, 0);
    assert.equal(get('action-bar').classes.has('hidden'), false);
    assert.equal(get('play-action').textContent, '确认发动');
    assert.equal(get('play-action').disabled, true);
    assert.ok(get('end-action').classes.has('hidden'), '不显示无意义的不响应按钮');
    model.selectTarget(3); model.selectTarget(1);
    render();
    assert.equal(get('play-action').disabled, false);
    get('play-action').onclick!();
    assert.deepEqual(submitted, [model.exact[0].id]);
    get('cancel-action').onclick!();
    render();
    assert.equal(model.tuxiActive, false);
    assert.equal(get('context-actions').children.length, 2);
    get('context-actions').children[1].onclick!();
    assert.equal(submitted.at(-1), model.normalDrawChoice!.id);
  } finally { Object.assign(globalThis, { document: prior }); }
});

test('增加展示用目标信息不改变现行规则策略的评分与选择', () => {
  const { state, prompt } = drawChoice();
  const observation = observe(state, 0);
  const before = { ...prompt, options: prompt.options.map(choice => {
    const { targets: _targets, ...data } = choice.data as Record<string, unknown>;
    return { ...choice, data };
  }) };
  const policy = new StrategicPolicy();
  const frozen = new FrozenPolicy();
  assert.deepEqual(policy.rank(observation, prompt), policy.rank(observation, before));
  assert.deepEqual(policy.rank(observation, prompt), frozen.rank(observation, prompt));
  assert.equal(policy.choose(observation, prompt), frozen.choose(observation, before));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mountainScene as scene, conserved } from './support/mountain-scenario.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision } from '../src/core/decision-manager.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { TableHud } from '../src/web/hud.ts';
import { qiaobianPresentation } from '../src/web/qiaobian-interaction.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import type { GameState } from '../src/domain/state.ts';

const ui = (s: GameState) => new TableInteraction(decision(s)!, observe(s, 0).self.hand);
class HudNode {
  textContent = ''; disabled = false; children: HudNode[] = []; onclick?: () => void;
  classList = { remove() {}, toggle() {} };
  append(...children: HudNode[]) { this.children.push(...children); }
  replaceChildren(...children: HudNode[]) { this.children = children; }
}
function withHud(run: (get: (id: string) => HudNode, hud: TableHud) => void) {
  const nodes = new Map<string, HudNode>();
  const get = (id: string) => { if (!nodes.has(id)) nodes.set(id, new HudNode()); return nodes.get(id)!; };
  const previous = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: get, createElement: () => new HudNode() } });
  try { run(get, new TableHud()); } finally { Object.assign(globalThis, { document: previous }); }
}

for (const [phase, label] of [['judge', '判定'], ['draw', '摸牌'], ['play', '出牌'], ['discard', '弃牌']] as const) {
  test(`巧变${label}阶段明确提示、只选一张手牌，确认前不支付，正常进行按钮可放弃`, () => withHud((get, hud) => {
    const x = scene(); x.general(0, 'mountain.zhanghe');
    const a = x.f.hand(0, 'sha'), b = x.f.hand(0, 'shan');
    const equipment = x.f.equip(0, 'bagua', 'armor');
    let state = x.tasks({ kind: 'phaseBefore', phase }); const model = ui(state);
    const submitted: string[] = [];
    const render = () => hud.render(observe(state, 0), model, false, [], choice => submitted.push(choice.id), () => {}, () => model.clear(), choice => model.scope(choice));
    render();
    assert.equal(get('phase').textContent, `${label}阶段前`);
    assert.match(get('prompt').textContent, new RegExp(`跳过${label}阶段`));
    assert.equal(get('play-action').disabled, true);
    assert.equal(get('end-action').textContent, `正常${label}`);
    assert.equal(model.selectCard(equipment), false);
    model.selectCard(a); model.selectCard(b); assert.deepEqual(model.cards, [b]);
    assert.deepEqual(state.players[0].hand, [a, b], '点选费用不直接弃置');
    render(); assert.equal(get('play-action').disabled, false);
    assert.equal(get('play-action').textContent, `弃牌并跳过${label}`);
    get('play-action').onclick!(); assert.deepEqual(submitted, [model.exact[0].id]);
    get('end-action').onclick!();
    state = x.rules.apply(state, submitted[1]);
    assert.deepEqual(state.players[0].hand, [a, b]); assert.equal(state.discard.includes(b), false);
    assert.equal(decision(state), null); conserved(state);
  }));
}

test('巧变跳摸牌逐人确认，显示已获得人数，不泄露暗牌，最多两名不同角色', () => withHud((get, hud) => {
  const x = scene(5); x.general(0, 'mountain.zhanghe');
  const cost = x.f.hand(0, 'sha'), a = x.f.hand(1, 'shan'), b = x.f.hand(2, 'tao');
  let state = x.tasks({ kind: 'phaseBefore', phase: 'draw' }, { kind: 'phaseDraw' });
  let model = ui(state); model.selectCard(cost); state = x.rules.apply(state, model.exact[0].id);
  const submitted: string[] = [];
  const render = () => hud.render(observe(state, 0), model, false, [], choice => submitted.push(choice.id), () => {}, () => model.clear(), () => {});
  model = ui(state); render();
  assert.equal(get('phase').textContent, '摸牌阶段 · 已跳过');
  assert.match(get('prompt').textContent, /已获得 0\/2/);
  assert.equal(get('end-action').textContent, '不获得手牌');
  assert.deepEqual(model.selectableCards, []);
  assert.ok(!JSON.stringify(decision(state)).includes(`"ids":[${a}]`));
  assert.equal(model.selectTarget(1), true); render();
  assert.equal(get('play-action').textContent, '获得其手牌');
  assert.equal(get('play-action').disabled, false);
  assert.equal(state.players[0].hand.length, 0, '选目标后仍需确认');
  get('play-action').onclick!(); state = x.rules.apply(state, submitted.pop()!);
  model = ui(state); render();
  assert.match(get('prompt').textContent, /已获得 1\/2/);
  assert.equal(get('end-action').textContent, '结束获得手牌');
  assert.equal(model.nextTargets.includes(1), false);
  model.selectTarget(2); render(); get('play-action').onclick!();
  state = x.rules.apply(state, submitted.pop()!);
  assert.deepEqual(state.players[0].hand, [a, b]); assert.equal(decision(state), null); conserved(state);
}));

for (const zone of ['equip', 'judge'] as const) test(`巧变移${zone}选牌后自动确定来源，只需选接收者再确认，排除已占用区域`, () => withHud((get, hud) => {
  const x = scene(5); x.general(0, 'mountain.zhanghe'); const cost = x.f.hand(0, 'sha');
  const card = zone === 'equip' ? x.f.equip(1, 'bagua', 'armor') : x.f.take('lebu');
  if (zone === 'judge') x.f.state.players[1].judge.push(card);
  if (zone === 'equip') x.f.equip(2, 'renwang', 'armor');
  else x.f.state.players[2].judge.push(x.f.take('lebu'));
  let state = x.tasks({ kind: 'phaseBefore', phase: 'play' }, { kind: 'phasePlay' });
  const costModel = ui(state); costModel.selectCard(cost); state = x.rules.apply(state, costModel.exact[0].id);
  const model = ui(state), obs = observe(state, 0), picks = zonePickerChoices(obs, model);
  assert.ok(picks.some(pick => pick.card?.id === card && pick.owner === 1 && pick.zone === zone));
  assert.equal(model.selectCard(card), true);
  assert.deepEqual(model.targets, [1], '无需额外点选原主人');
  assert.equal(model.nextTargets.includes(1), false);
  assert.equal(model.nextTargets.includes(2), false, '已有同类装备或同名判定牌的角色不能接收');
  assert.equal(model.selectTarget(2), false);
  assert.equal(model.selectTarget(3), true);
  const submitted: string[] = [];
  const render = () => hud.render(obs, model, false, [], choice => submitted.push(choice.id), () => {}, () => model.clear(), () => {});
  render();
  assert.equal(get('play-action').textContent, '确认移动');
  assert.equal(get('play-action').disabled, false);
  assert.equal(get('end-action').textContent, '不移动牌');
  assert.match(get('prompt').textContent, /移给角色4/);
  assert.ok(zone === 'equip' ? state.players[1].equip.armor === card : state.players[1].judge.includes(card), '选接收者不会直接移牌');
  assert.equal(model.selectTarget(3), true); assert.deepEqual(model.targets, [1]);
  render(); assert.equal(get('play-action').disabled, true);
  model.selectTarget(3); render(); get('play-action').onclick!();
  const action = model.leaves.find(choice => choice.id === submitted[0])!;
  assert.deepEqual(action.targetIds, [1, 3], '提交的原始合法行动仍保留来源与接收者');
  state = x.rules.apply(state, submitted[0]);
  assert.ok(zone === 'equip' ? state.players[3].equip.armor === card : state.players[3].judge.includes(card));
  assert.equal(decision(state), null); assert.equal(state.skipPlay, true); conserved(state);
}));

test('巧变改选卡牌、拖动、取消均重新确定正确来源，不保留旧目标', () => {
  const x = scene(5); x.general(0, 'mountain.zhanghe'); const cost = x.f.hand(0, 'sha');
  const a = x.f.equip(1, 'bagua', 'armor'), b = x.f.equip(2, 'qinggang', 'weapon');
  let state = x.tasks({ kind: 'phaseBefore', phase: 'play' });
  const before = ui(state); before.selectCard(cost); state = x.rules.apply(state, before.exact[0].id);
  const model = ui(state);
  model.selectCard(a); model.selectTarget(3); model.selectCard(b);
  assert.deepEqual(model.cards, [b]); assert.deepEqual(model.targets, [2]);
  model.selectTarget(1); assert.equal(model.exact.length, 1);
  model.dragCard(b); assert.deepEqual(model.targets, [2]); assert.ok(model.nextTargets.includes(1));
  model.selectCard(b); assert.deepEqual(model.cards, []); assert.deepEqual(model.targets, []);
  model.selectCard(a); model.clear(); assert.deepEqual(model.targets, []); assert.deepEqual(model.cards, []);
});

for (const phase of ['draw', 'play'] as const) test(`巧变跳过${phase}后无目标有明确提示，结束不返还费用或恢复正常阶段`, () => {
  const x = scene(); x.general(0, 'mountain.zhanghe'); const cost = x.f.hand(0, 'sha');
  let state = x.tasks({ kind: 'phaseBefore', phase }, { kind: phase === 'draw' ? 'phaseDraw' : 'phasePlay' });
  const model = ui(state); model.selectCard(cost); state = x.rules.apply(state, model.exact[0].id);
  const after = ui(state), presentation = qiaobianPresentation(observe(state, 0), after)!;
  assert.match(presentation.prompt, /没有.*请结束巧变/);
  assert.ok(state.discard.includes(cost));
  state = x.rules.apply(state, after.leaves.find(choice => choice.actionType === 'pass')!.id);
  assert.equal(state.players[0].hand.length, 0); assert.equal(decision(state), null);
  assert.equal(phase === 'draw' ? state.skipDraw : state.skipPlay, true); conserved(state);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, decision, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { judgementCard, pendingJudgementCard } from '../src/web/judgement-card.ts';
import { tablePreviewCards } from '../src/web/table-preview.ts';
import { judgementTablePosition, zonePickerPosition } from '../src/web/layout.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { JudgementFlow } from '../src/rules/flows/judgement-flow.ts';
import { StandardRuleset } from '../src/app/standard-game.ts';

function guidaoScene(count: number, equipmentCount: number, withSimayi = false) {
  const content = contentForCards('junzheng', ['wind', 'fire']), runtime = new ContentRuntime(content);
  const f = fixture(count, { cards: 'junzheng', generalPacks: ['wind', 'fire'], ...(count === 5 ? { mode: 'identity' } : {}) });
  f.state.players[0].general = 'wind.zhangjiao'; f.hand(0, 'sha', 'spade');
  f.hand(1, 'tao');
  const equipment = ([['qinggang', 'weapon'], ['bagua', 'armor'], ['dilu', 'plusHorse'], ['dawan', 'minusHorse']] as const)
    .slice(0, equipmentCount).map(([name, slot]) => f.equip(0, name, slot));
  let replacement: number | undefined;
  if (withSimayi) { f.state.players[1].general = 'standard.simayi'; replacement = f.hand(1, 'shan', 'heart'); }
  const original = f.top('lebu', 'spade', 6);
  new JudgementFlow(runtime).begin(f.state, 0, 'shandian', { kind: 'judgementTriggers' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  assert.equal(decision(f.state)?.kind, 'judgeReplace');
  return { f, original, equipment, replacement,
    rules: new StandardRuleset(undefined, undefined, content) };
}

test('对方八卦判定的牌面和红黑结果可从公开观察值显示', () => {
  for (const [name, suit, result] of [
    ['tao', 'heart', '红色 · 视为闪'], ['sha', 'spade', '黑色 · 判定失败'],
  ] as const) {
    const f = fixture();
    const attack = f.hand(0, 'sha');
    f.equip(1, 'bagua', 'armor');
    const revealed = f.top(name, suit);
    let state = f.start();
    const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === attack);
    assert.ok(play);
    state = apply(state, play.id);
    const activate = legalActions(state).find(choice => choice.data?.type === 'bagua');
    assert.ok(activate);
    state = apply(state, activate.id);
    const view = observe(state, 0);
    const judged = view.events.find(event => event.kind === 'judged' && event.data.reason === 'bagua');
    if (!judged || judged.kind !== 'judged') throw new Error('没有公开的八卦判定事件');
    assert.equal(judged.data.card, revealed);
    assert.equal(view.eventCards?.[revealed]?.suit, suit);
    assert.deepEqual(judgementCard(judged, view), {
      kind: 'finish', card: view.eventCards?.[revealed], label: `对手 · 八卦阵判定\n${result}`,
    });
  }
});

test('鬼才改判时公开桌面原牌、换入新牌，最后只结算新牌', () => {
  const f = fixture(5, { mode: 'identity' });
  f.state.players[2].general = 'standard.simayi';
  const attack = f.hand(0, 'sha');
  const replacement = f.hand(2, 'shan', 'heart');
  f.equip(1, 'bagua', 'armor');
  const original = f.top('sha', 'spade');
  let state = f.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === attack &&
    choice.data.targets[0] === 1);
  assert.ok(play);
  state = apply(state, play.id);
  const activate = legalActions(state).find(choice => choice.data?.type === 'bagua');
  assert.ok(activate);
  state = apply(state, activate.id);
  const before = observe(state, 0);
  assert.equal(before.table.at(-1)?.id, original);
  assert.ok(before.table.some(card => card.id === attack));
  const replace = legalActions(state).find(choice => choice.data?.type === 'replace' && choice.data.cid === replacement);
  assert.ok(replace);
  state = apply(state, replace.id);
  const after = observe(state, 0);
  const cues = after.events.map(event => judgementCard(event, after)).filter(cue => cue !== null);
  assert.deepEqual(cues.map(cue => [cue.kind, cue.card.id]), [
    ['replace', replacement], ['finish', replacement],
  ]);
  assert.equal(cues[0]?.kind === 'replace' && cues[0].oldCard.id, original);
  assert.match(cues[1]?.label ?? '', /红色 · 视为闪/);
});

for (const equipmentCount of [0, 1, 2, 3, 4]) test(`鬼道等待改判时判定牌与${equipmentCount}件装备并排显示，判定牌不会成为费用`, () => {
  for (const count of [2, 5]) {
    const { f, original, equipment } = guidaoScene(count, equipmentCount);
    // A different resolving card can be later in the public table array.
    f.state.table.push(f.take('wuzhong'));
    const prompt = decision(f.state)!, obs = observe(f.state, 0), model = new TableInteraction(prompt, obs.self.hand);
    const picks = zonePickerChoices(obs, model);
    assert.deepEqual(picks.map(pick => pick.card?.id), equipment);
    const previews = tablePreviewCards(obs, prompt, model.selectableCards, {
      zonePickerCount: picks.length, activeJudgement: false, hasTableCard: () => false,
    });
    assert.equal(previews.length, 1); assert.equal(previews[0].card.id, original);
    assert.equal(previews[0].label, '判定牌'); assert.equal(previews[0].selectable, false);
    assert.equal(model.selectCard(original), false);
    assert.deepEqual(previews[0].position, judgementTablePosition(picks.length));
    for (let index = 0; index < picks.length; index++) {
      const pos = zonePickerPosition(index, picks.length, true);
      assert.ok(Math.abs(pos.x - previews[0].position.x) >= (pos.width + 116) / 2,
        '静态判定牌和动态换入牌都不得被装备选牌遮挡');
    }
    assert.equal(pendingJudgementCard(observe(f.state, 1), prompt)?.id, original);
    assert.ok(!previews.some(preview => f.state.players[1].hand.includes(preview.card.id)));
  }
});

test('鬼道换入装备后轮到鬼才，当前判定牌跟随新牌，已显示的动态判定牌不重复画', () => {
  const { f, original, equipment, replacement, rules } = guidaoScene(5, 1, true);
  const cost = legalActions(f.state).find(choice => choice.data?.type === 'replace' && choice.data.cid === equipment[0])!;
  const state = rules.apply(f.state, cost.id), prompt = decision(state)!, obs = observe(state, 1);
  assert.equal(prompt.kind, 'judgeReplace'); assert.equal(prompt.actor, 1);
  assert.equal(pendingJudgementCard(obs, prompt)?.id, equipment[0]);
  assert.ok(state.players[0].hand.includes(original));
  const model = new TableInteraction(prompt, obs.self.hand);
  const display = { zonePickerCount: 0, activeJudgement: true, hasTableCard: (id: number) => id === equipment[0] };
  assert.deepEqual(tablePreviewCards(obs, prompt, model.selectableCards, display), []);
  display.hasTableCard = () => false;
  assert.deepEqual(tablePreviewCards(obs, prompt, model.selectableCards, display).map(item => item.card.id), [equipment[0]]);
  const next = legalActions(state).find(choice => choice.data?.type === 'replace' && choice.data.cid === replacement)!;
  const final = rules.apply(state, next.id), after = observe(final, 1);
  const result = [...after.events].reverse().find(event => event.kind === 'judged');
  assert.ok(result); assert.equal(judgementCard(result, after)?.card.id, replacement);
});

test('未等待改判时沿用原桌面隐藏与选牌布局，无法从过往事件恢复不存在的判定牌', () => {
  const { f, original } = guidaoScene(2, 1);
  const obs = observe(f.state, 0), prompt = decision(f.state)!;
  obs.table = [];
  assert.equal(pendingJudgementCard(obs, prompt), undefined);
  assert.deepEqual(tablePreviewCards(obs, prompt, [], { zonePickerCount: 1, activeJudgement: false, hasTableCard: () => false }), []);
  obs.table = [f.state.cards[original]];
  const play = { actor: 0, kind: 'play', title: '', options: [] };
  assert.deepEqual(tablePreviewCards(obs, play, [], { zonePickerCount: 1, activeJudgement: false, hasTableCard: () => false }), []);
  for (const count of [1, 4, 12]) {
    assert.equal(zonePickerPosition(0, count).y, count <= 10 ? 494 : 445);
  }
});

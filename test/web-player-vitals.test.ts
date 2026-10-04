import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe, type GameState } from '../engine.ts';
import type { VisibleEvent } from '../src/domain/events.ts';
import { PlayerVitalsPresenter, type PlayerVitalsState } from '../src/web/player-vitals.ts';
import { healthPips, healthPipLayout } from '../src/web/health-pips.ts';
import { fixture } from './support/scenario-builder.ts';

function choose(state: GameState, type: string): GameState {
  const action = legalActions(state).find(choice => choice.data?.type === type);
  assert.ok(action, `缺少 ${type} 选择`);
  return apply(state, action.id);
}
const players = (state: GameState) => {
  const obs = observe(state, 0);
  return [obs.self, ...obs.others];
};

for (const self of [false, true]) {
  test(`${self ? '己方' : '对手'}致命伤害立即清空血条，阵亡语音未结束时已显示阵亡`, async () => {
    const f = fixture();
    const victim = self ? 0 : 1;
    f.state.players[victim].hp = 1;
    f.hand(self ? 1 : 0, 'sha');
    let state = f.start(self ? 1 : 0);
    const displayed = new Map<number, PlayerVitalsState>();
    const presenter = new PlayerVitalsPresenter((id, status) => displayed.set(id, status));
    presenter.reset(players(state));
    const last = Math.max(0, ...observe(state, 0).events.map(event => event.id));
    state = choose(state, 'play');
    state = choose(state, 'pass');
    assert.equal(state.players[victim].alive, false);
    const events = observe(state, 0).events.filter(event => event.id > last);
    let finishVoice!: () => void;
    const deathVoice = new Promise<void>(resolve => { finishVoice = resolve; });
    let finished = false;
    const playback = (async () => {
      for (const event of events) await presenter.play(event, () => {
        if (event.kind === 'damaged') {
          assert.deepEqual(displayed.get(victim), { hp: 0, maxHp: 4, alive: true });
          assert.deepEqual(healthPips(displayed.get(victim)!), ['empty', 'empty', 'empty', 'empty']);
        }
        if (event.kind === 'died') {
          assert.deepEqual(displayed.get(victim), { hp: 0, maxHp: 4, alive: false });
          assert.deepEqual(healthPips(displayed.get(victim)!), ['empty', 'empty', 'empty', 'empty']);
          return deathVoice;
        }
        return Promise.resolve();
      });
      finished = true;
    })();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(finished, false, '模拟阵亡语音尚未播放结束');
    assert.deepEqual(displayed.get(victim), { hp: 0, maxHp: 4, alive: false });
    finishVoice();
    await playback;
  });
}

test('濒死救援按公开事件顺序显示零血再回血，不提前使用最终观察的体力', async () => {
  const f = fixture();
  f.state.players[1].hp = 1;
  f.hand(0, 'sha');
  f.hand(1, 'tao');
  let state = f.start();
  const history: PlayerVitalsState[] = [];
  const presenter = new PlayerVitalsPresenter((id, status) => { if (id === 1) history.push(status); });
  presenter.reset(players(state));
  const last = Math.max(0, ...observe(state, 0).events.map(event => event.id));
  state = choose(state, 'play');
  state = choose(state, 'pass');
  state = choose(state, 'save');
  assert.equal(state.players[1].hp, 1);
  assert.equal(state.players[1].alive, true);
  for (const event of observe(state, 0).events.filter(event => event.id > last))
    await presenter.play(event, () => Promise.resolve());
  assert.deepEqual(history, [
    { hp: 0, maxHp: 4, alive: true },
    { hp: 1, maxHp: 4, alive: true },
  ]);
  assert.deepEqual(history.map(healthPips), [
    ['empty', 'empty', 'empty', 'empty'],
    ['empty', 'empty', 'empty', 'low'],
  ], '救援先全灰，再亮起底部一枚橙色阴阳鱼');
});

test('苦肉失去体力在技能动画和摸牌之前更新，重绘重置后不重复扣血', async () => {
  const f = fixture();
  f.state.players[0].general = 'standard.huanggai';
  let state = f.start();
  const history: PlayerVitalsState[] = [];
  const presenter = new PlayerVitalsPresenter((_id, status) => history.push(status));
  presenter.reset(players(state));
  const last = Math.max(0, ...observe(state, 0).events.map(event => event.id));
  state = choose(state, 'activeSkill');
  for (const event of observe(state, 0).events.filter(event => event.id > last))
    await presenter.play(event, () => {
      if (event.kind === 'skillActivated') assert.equal(history.at(-1)?.hp, 3);
      return Promise.resolve();
    });
  presenter.reset(players(state));
  state = choose(state, 'activeSkill');
  const lost = observe(state, 0).events.filter(event => event.kind === 'hpLost').at(-1)!;
  await presenter.play(lost, () => Promise.resolve());
  assert.equal(history.at(-1)?.hp, 2);
  assert.deepEqual(history.map(healthPips), [
    ['empty', 'healthy', 'healthy', 'healthy'],
    ['empty', 'empty', 'low', 'low'],
  ], '苦肉先扣上方一格，降至半血后剩余格变橙色');
});

test('连续伤害保留负体力供濒死救援提示，死亡不二次扣血，不影响旁人', async () => {
  const f = fixture();
  f.state.players[1].hp = 1;
  const history: [number, PlayerVitalsState][] = [];
  const presenter = new PlayerVitalsPresenter((id, status) => history.push([id, status]));
  presenter.reset(players(f.start()));
  const events: VisibleEvent[] = [
    { id: 1, kind: 'damaged', data: { target: 1, source: 0, amount: 3, hp: -2, maxHp: 4, card: null } },
    { id: 2, kind: 'died', data: { target: 1, source: 0 } },
    { id: 3, kind: 'dying', data: { target: 1 } },
  ];
  for (const event of events) await presenter.play(event, () => Promise.resolve());
  assert.deepEqual(history, [
    [1, { hp: -2, maxHp: 4, alive: true }],
    [1, { hp: -2, maxHp: 4, alive: false }],
  ]);
  assert.ok(history.every(([, status]) => healthPips(status).every(pip => pip === 'empty')));
});

test('三血、四血、五血角色各显示对应格数，满血为绿色', () => {
  for (const maxHp of [3, 4, 5]) {
    const pips = healthPips({ hp: maxHp, maxHp, alive: true });
    assert.equal(pips.length, maxHp);
    assert.ok(pips.every(pip => pip === 'healthy'));
  }
});

test('五血角色两血为橙色，恢复至三血变绿，空格保持在上方', () => {
  assert.deepEqual(healthPips({ hp: 2, maxHp: 5, alive: true }), ['empty', 'empty', 'empty', 'low', 'low']);
  assert.deepEqual(healthPips({ hp: 3, maxHp: 5, alive: true }), ['empty', 'empty', 'healthy', 'healthy', 'healthy']);
});

test('体力超上限不多画格子，死亡状态即使体力为正也全部为空', () => {
  assert.deepEqual(healthPips({ hp: 6, maxHp: 3, alive: true }), ['healthy', 'healthy', 'healthy']);
  assert.deepEqual(healthPips({ hp: 1, maxHp: 3, alive: false }), ['empty', 'empty', 'empty']);
});

test('短名、长名及三至五血的血条始终在名字下方且不越出头像底部', () => {
  for (const height of [214, 218, 242, 260]) for (const nameHeight of [54, 81]) for (const count of [3, 4, 5]) {
    const nameBottom = -height / 2 + 43 + nameHeight;
    const slots = healthPipLayout(nameBottom, height / 2, count);
    assert.equal(slots.length, count);
    slots.forEach((slot, index) => {
      assert.ok(slot.size > 0 && slot.size <= 26);
      assert.ok(slot.y - slot.size / 2 >= nameBottom + 6 - 1e-9, '不与名字重叠');
      assert.ok(slot.y + slot.size / 2 <= height / 2 - 8 + 1e-9, '不越出头像');
      if (index > 0) assert.ok(slot.y - slot.size / 2 >= slots[index - 1].y + slots[index - 1].size / 2 - 1e-9,
        '相邻阴阳鱼不重叠');
    });
  }
});

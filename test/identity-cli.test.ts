import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameEngine } from '../engine.ts';
import { IdentityGeneralSelector } from '../src/app/identity-general-selector.ts';
import { TerminalView } from '../terminal-view.ts';

const players = Array.from({ length: 5 }, (_, id) => ({ label: id === 0 ? '你' : `电脑${id + 1}`, sex: 'male' as const }));

test('五人选将不重复，主公候选包含三名主公武将，固定种子可复现', () => {
  const selector = new IdentityGeneralSelector();
  const first = selector.offer(7, 4);
  assert.deepEqual(selector.offer(7, 4), first);
  assert.deepEqual(first.candidates.map(group => group.length), [3, 3, 3, 3, 5]);
  assert.equal(new Set(first.candidates.flat().map(general => general.id)).size, 17);
  assert.equal(first.candidates[4].filter(general => general.skills.some(skill => skill.includes('主公技'))).length, 3);
  first.computerPicks.forEach((pick, seat) => assert.ok(first.candidates[seat].some(general => general.id === pick.id)));
});

test('五人身份局终端仅显示已知身份，24 行窗口能选择响应', () => {
  const game = GameEngine.standard({ mode: 'identity', seed: 7, players });
  const observation = game.getObservation(0);
  const result = new TerminalView().render(observation, 24, '请选择行动', [{ id: 'one', label: '行动' }]);
  assert.match(result.text, /五人身份局/);
  assert.match(result.text, /【主公】/);
  assert.match(result.text, /【未知】/);
  assert.ok(result.text.split('\n').length <= 23);
  assert.equal(result.visibleOptions.length, 1);
  observation.self.hand = Array.from({ length: 20 }, (_, index) =>
    ({ ...observation.self.hand[index % observation.self.hand.length], id: 1000 + index }));
  const crowded = new TerminalView().render(observation, 24, '请选择行动', [{ id: 'one', label: '行动' }]);
  assert.equal(crowded.visibleOptions.length, 1);
});

test('CLI 模式选择进入五人身份局，真实选将与公开身份进入同一引擎轨迹', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sanguosha-identity-cli-'));
  try {
    const path = join(directory, 'identity.json');
    const run = spawnSync(process.execPath, ['cli.ts', '--seed', '7', '--no-color', '--dump', path], {
      cwd: process.cwd(), input: '2\n1\nq\n', encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /选择模式/);
    assert.match(run.stdout, /你的身份：反贼；主公：座1/);
    assert.match(run.stdout, /你在座3，身份：【反贼】；主公在座1；你选择【许褚】/);
    assert.match(run.stdout, /电脑1（孙权）【主公】/);
    assert.match(run.stdout, /电脑2（甘宁）【未知】/);
    const trace = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(trace.config.mode, 'identity');
    assert.equal(trace.config.cards, 'standard');
    assert.equal(Object.keys(trace.frames[0].state.cards).length, 108);
    assert.equal(trace.config.players.length, 5);
    assert.equal(trace.config.players[2].general, 'standard.xuzhu');
    assert.equal(trace.frames[0].state.mode.roles[0], 'lord');
    assert.equal(trace.frames[0].state.mode.roles[2], 'rebel');
    assert.equal(trace.frames[0].state.active, 0);
    assert.ok(trace.frames.some((frame: { transition: { type: string; actor?: number } }) =>
      frame.transition.type === 'choice' && frame.transition.actor === 0));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('人类担任主公时可从五名武将中选择，主公额外体力由共用模式添加', () => {
  const run = spawnSync(process.execPath, ['cli.ts', '--mode', 'identity', '--seed', '3205', '--no-color'], {
    cwd: process.cwd(), input: '5\nq\n', encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /你的身份：主公；主公：座1/);
  assert.match(run.stdout, /从以下五名武将中选一名/);
  assert.match(run.stdout, /你选择【甘宁】/);
  assert.match(run.stdout, /你（甘宁）【主公】 5\/5血/);
});

test('五人 CLI 显式选择军争，纯 AI 模式能运行至阵营胜负', () => {
  // The military seed includes a long recovery-heavy game; retain its actual
  // victory assertion and the CLI's 5000-decision bound, allowing CPU contention.
  const run = spawnSync(process.execPath, ['cli.ts', '--demo', '--mode', 'identity', '--cards', 'junzheng', '--seed', '7', '--no-color'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /标准＋军争牌包/);
  assert.match(run.stdout, /结果：.+获胜；共 \d+ 次决策/);
  assert.match(run.stdout, /【忠臣】/);
  assert.match(run.stdout, /【内奸】/);
});

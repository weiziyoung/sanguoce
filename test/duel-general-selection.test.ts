import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GameEngine } from '../engine.ts';
import { DuelGeneralSelector } from '../src/app/duel-general-selector.ts';
import { renderGeneralSelection } from '../src/presentation/general-selection-view.ts';

test('同一随机种子提供双方各三名不重复的标准武将，电脑只从自己的三人中随机选', () => {
  const selector = new DuelGeneralSelector();
  const offer = selector.offer(7);
  assert.deepEqual(selector.offer(7), offer);
  assert.equal(offer.player.length, 3);
  assert.equal(offer.computer.length, 3);
  assert.equal(new Set([...offer.player, ...offer.computer].map(general => general.id)).size, 6);
  assert.ok(offer.computer.some(general => general.id === offer.computerPick.id));
  assert.ok(offer.player.some(general => general.id === offer.demoPick.id));
  assert.ok(offer.player.every(general => general.skills.length > 0 && general.hp > 0));
  assert.match(renderGeneralSelection(offer.player, 7), /1\. .+技能：.+2\. /s);
  assert.match(renderGeneralSelection(offer.player, 7), /激将（主公技，1v1不可用）/);
  assert.throws(() => selector.offer(1.5), /整数/);
});

test('选定的两名武将进入同一 1v1 引擎，体力与身份来自武将定义', () => {
  const offer = new DuelGeneralSelector().offer(7);
  const chosen = offer.player[0];
  const opponent = offer.computerPick;
  const game = GameEngine.standard({ seed: 7, players: [
    { label: `你（${chosen.label}）`, sex: chosen.sex, general: chosen.id },
    { label: `电脑（${opponent.label}）`, sex: opponent.sex, general: opponent.id },
  ] });
  const observation = game.getObservation(0);
  assert.equal(observation.self.general, chosen.id);
  assert.equal(observation.self.maxHp, chosen.hp);
  assert.equal(observation.others[0].general, opponent.id);
  assert.equal(observation.others[0].maxHp, opponent.hp);
});

test('终端选将页接收编号，电脑选择与双方武将写入完整轨迹', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sanguosha-select-'));
  try {
    const path = join(directory, 'game.json');
    const run = spawnSync(process.execPath, ['cli.ts', '--seed', '7', '--no-color', '--dump', path], {
      cwd: process.cwd(), input: '1\n2\nq\n', encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /从以下三名武将中选一名/);
    assert.match(run.stdout, /选择【刘备】/);
    assert.match(run.stdout, /电脑候选：.+随机选中【马超】/);
    const trace = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(trace.config.players[0].general, 'standard.liubei');
    assert.equal(trace.config.players[1].general, 'standard.machao');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('默认随机种子会显示在选将页，并可用 --seed 复现候选武将', () => {
  const launch = (args: string[]) => spawnSync(process.execPath, ['cli.ts', '--no-color', ...args], {
    cwd: process.cwd(), input: 'q\n', encoding: 'utf8',
  });
  const first = launch([]);
  assert.equal(first.status, 0, first.stderr);
  const match = first.stdout.match(/随机种子 (\d+)/);
  assert.ok(match, first.stdout);
  const replay = launch(['--seed', match[1]]);
  assert.equal(replay.status, 0, replay.stderr);
  assert.equal(replay.stdout, first.stdout);
});

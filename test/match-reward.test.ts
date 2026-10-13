import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { WebGameDocument } from '../src/app/web-game-record.ts';
import type { RuleEvent } from '../src/domain/events.ts';
import { matchReward, rewardDescription } from '../src/web/match-reward.ts';
import { PlayerStore } from '../src/web/player-store.ts';

const event = (kind: 'damaged' | 'recovered' | 'died', data: object): RuleEvent =>
  ({ id: 1, frameId: null, parentEventId: null, kind, data }) as RuleEvent;
function document(mode: 'duel' | 'identity', result: 'win' | 'loss' | 'draw' = 'win', role = 'lord'): WebGameDocument {
  return { format: 'sanguosha.web-game.v1', startedAt: '2026-10-13T00:00:00Z', finishedAt: '2026-10-13T00:10:00Z',
    humanSeat: 0, config: { seed: 7, mode }, turn: 3, choices: [], events: [],
    players: Array.from({ length: mode === 'identity' ? 5 : 2 }, (_, id) => ({ id, label: `座${id + 1}`,
      ...(mode === 'identity' ? { role: [role, 'loyalist', 'rebel', 'rebel', 'renegade'][id] } : {}) })),
    outcome: result === 'draw' ? { status: 'draw', reason: 'no-survivors' }
      : { status: 'finished', winners: result === 'win' ? [0] : [1], losers: [], reason: 'test' } };
}

test('每局完成给基础积分，落败与平局也积累；进行中不结算', () => {
  for (const result of ['loss', 'draw'] as const) {
    assert.equal(matchReward(document('duel', result)).total, 5);
    assert.equal(matchReward(document('identity', result)).total, 40);
    assert.equal(matchReward(document('identity', result, 'renegade')).renegade, 0);
  }
  assert.throws(() => matchReward({ ...document('duel'), outcome: { status: 'ongoing' } }), /尚未结束/);
});

test('伤害、人头、实际治疗计入表现；友伤误杀扣分，完成奖励保持为正', () => {
  const game = document('identity');
  game.events = [event('damaged', { source: 0, target: 2, amount: 4 }),
    event('recovered', { source: 0, player: 0, amount: 2 }), event('died', { source: 0, target: 2 })];
  const reward = matchReward(game);
  assert.deepEqual(reward, { ruleVersion: 1, mode: 'identity', completion: 40, performance: 21, victory: 40, renegade: 0, total: 101 });
  game.events.push(event('damaged', { source: 0, target: 1, amount: 3 }), event('died', { source: 0, target: 1 }));
  assert.equal(matchReward(game).performance, 4);
  game.events.push(event('damaged', { source: 0, target: 1, amount: 100 }));
  assert.equal(matchReward(game).performance, 0); assert.equal(matchReward(game).total, 80);
});

test('内奸获胜额外奖励，普通身份胜利不重复计入贡献榜胜利分', () => {
  const ordinary = matchReward(document('identity'));
  const renegade = matchReward(document('identity', 'win', 'renegade'));
  assert.equal(ordinary.total, 80); assert.equal(renegade.total, 140); assert.equal(renegade.renegade, 60);
  assert.match(rewardDescription(renegade), /内奸获胜 \+60/);
  assert.equal(matchReward(document('duel', 'win', 'renegade')).total, 15, '1v1 不套用身份奖励');
});

test('表现分有上限，1v1 的最高积分仍低于五人局的最低积分', () => {
  const duel = document('duel'); duel.events = [event('damaged', { source: 0, target: 1, amount: 100 })];
  const identity = document('identity'); identity.events = [event('damaged', { source: 0, target: 2, amount: 100 })];
  assert.equal(matchReward(duel).total, 30); assert.equal(matchReward(identity).total, 120);
  assert.ok(matchReward(duel).total < matchReward(document('identity', 'loss')).total);
  identity.players[0].role = 'renegade'; assert.equal(matchReward(identity).total, 180);
});

test('拒绝非法计分事件，浏览器提供的积分字段不参与计算', () => {
  const game = document('duel');
  for (const amount of [-1, NaN, Infinity, 1.5, '100', 1000001]) {
    game.events = [event('damaged', { source: 0, target: 1, amount })];
    assert.throws(() => matchReward(game), /无效/);
  }
  game.events = [event('died', { source: 0, target: 99 })]; assert.throws(() => matchReward(game), /无效/);
  game.events = []; Object.assign(game, { earnedPoints: 1000000, reward: { total: 1000000 } });
  assert.equal(matchReward(game).total, 15);
});

test('已有 v1 数据库升级保留历史，旧局不补发积分，新局入账重试不重复', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sanguoce-reward-migration-'));
  const path = join(directory, 'players.sqlite');
  let store = new PlayerStore(path);
  try {
    const guest = store.issueGuest(); const ticket = store.start(guest.player.id, 'duel', 7); const match = store.match(ticket)!;
    store.close();
    const old = new DatabaseSync(path);
    const legacy = { id: match.id, finishedAt: document('duel').finishedAt, mode: 'duel', general: '', result: 'win', turn: 3, source: 'browser' };
    old.exec('DROP TABLE match_rewards; PRAGMA user_version=1;');
    old.prepare('UPDATE matches SET document_hash=?,finished_at=?,result=?,summary=? WHERE id=?')
      .run('legacy', legacy.finishedAt, 'win', JSON.stringify(legacy), match.id);
    old.close(); store = new PlayerStore(path);
    assert.equal(store.history(guest.player.id).total, 1); assert.equal(store.history(guest.player.id).points, 0);
    assert.equal(store.history(guest.player.id).games[0].earnedPoints, 0);
    assert.equal(store.receipt(match.id, guest.player.id).earnedPoints, 0);
    const next = store.match(store.start(guest.player.id, 'duel', 8))!;
    const reward = matchReward(document('duel'));
    const summary = { ...legacy, id: next.id, mode: 'duel' as const, result: 'win' as const,
      source: 'browser' as const, earnedPoints: reward.total, reward };
    store.finish(next.id, 'new', summary); store.finish(next.id, 'new', summary);
    assert.equal(store.history(guest.player.id).total, 2); assert.equal(store.history(guest.player.id).points, 15);
    assert.equal(store.profile(guest.player.id).points, 15);
    assert.equal(store.receipt(next.id, guest.player.id).reward?.total, 15);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});

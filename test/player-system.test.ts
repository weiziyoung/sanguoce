import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { createProductionServer } from '../src/web/production-server.ts';
import type { PlayerHistory, PlayerSession, PlayerLeaderboard } from '../src/web/player-types.ts';

const ORIGIN = 'https://weiziyang.wiki';
const game = (seed = 7) => ({ format: 'sanguosha.web-game.v1', startedAt: '2026-10-13T00:00:00Z',
  finishedAt: '2026-10-13T00:10:00Z', humanSeat: 0, config: { seed }, turn: 3,
  choices: [], events: [], players: [{ id: 0, general: 'standard.caocao', label: '曹操' }],
  outcome: { status: 'finished', winners: [0], losers: [1], reason: 'last-survivor' } });

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'sanguoce-players-'));
  await mkdir(join(directory, 'dist')); await writeFile(join(directory, 'dist/index.html'), '<title>游戏</title>');
  const auth = { unavailable: false, malformed: false, calls: 0, callback: '' };
  const authFetcher = (async (url, init) => {
    auth.calls++;
    const path = String(url);
    if (auth.unavailable) return new Response('', { status: 503 });
    if (path.endsWith('/auth/sign-in/social')) {
      const body = JSON.parse(String(init?.body)); auth.callback = body.callbackURL;
      assert.equal(body.provider, 'github'); assert.equal(body.disableRedirect, true);
      assert.equal(new Headers(init?.headers).get('origin'), ORIGIN);
      return Response.json({ data: { url: 'https://github.com/login/oauth/authorize?state=test' } },
        { headers: { 'Set-Cookie': 'better-auth.state=test; Path=/; HttpOnly; Secure' } });
    }
    if (path.endsWith('/auth/sign-out')) return Response.json({ success: true },
      { headers: { 'Set-Cookie': 'better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure' } });
    assert.ok(path.endsWith('/auth/session'));
    const cookie = new Headers(init?.headers).get('cookie') ?? '';
    const name = cookie.includes('session_token=alice') ? 'alice' : cookie.includes('session_token=bob') ? 'bob' : null;
    return Response.json({ data: auth.malformed ? {} : name ? {
      id: name === 'alice' ? '9007199254740993987' : '9007199254740993988', name,
      image: 'https://avatars.githubusercontent.com/u/1', email: 'private@example.com', role: 'reader',
    } : null });
  }) as typeof fetch;
  const create = () => createProductionServer({ directory: join(directory, 'dist'), traceDirectory: join(directory, 'traces'),
    origin: ORIGIN, basePath: '/sanguoce/', authApiUrl: 'http://mx-core:2333/api/v3', authFetcher });
  let server = create();
  const listen = async () => {
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  };
  let base = await listen();
  const actor = (blogCookie = '') => {
    const cookies = new Map<string, string>();
    if (blogCookie) cookies.set('better-auth.session_token', blogCookie);
    let id = '';
    const request = async (path: string, method = 'GET', body?: object, extra: Record<string, string> = {}) => {
      const reply = await fetch(`${base}${path}`, { method, headers: {
        cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(method !== 'GET' ? { origin: ORIGIN, 'Content-Type': 'application/json' } : {}),
        'X-Sanguoce-Player': id, ...extra,
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      for (const value of reply.headers.getSetCookie()) {
        const [key, token] = value.split(';')[0].split('=');
        if (token) cookies.set(key, token); else cookies.delete(key);
      }
      return reply;
    };
    return { request, cookies, get id() { return id; },
      async me() {
        const reply = await request('/api/player/me'); assert.equal(reply.status, 200);
        const session = await reply.json() as PlayerSession; id = session.player.id; return session;
      },
      async history() {
        const reply = await request('/api/player/history'); assert.equal(reply.status, 200); return await reply.json() as PlayerHistory;
      },
      async start(seed = 7, mode: 'duel' | 'identity' = 'duel') {
        const reply = await request('/api/player/games', 'POST', { mode, seed }); assert.equal(reply.status, 201);
        return (await reply.json() as { ticket: string }).ticket;
      },
      save(ticket: string, document: object = game()) { return request('/api/web-games', 'POST', document, { 'X-Sanguoce-Match': ticket }); },
    };
  };
  return { auth, actor, directory, async restart() {
    await new Promise<void>(resolve => server.close(() => resolve())); server = create(); base = await listen();
  }, async close() {
    await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true });
  } };
}

test('游客身份跨请求／服务重启持久保存，昵称可修改，凭据只存哈希', async () => {
  const f = await fixture();
  try {
    const guest = f.actor(); const first = await guest.me();
    assert.equal(first.auth, 'guest'); assert.match(first.player.nickname, /^游侠·/);
    const token = guest.cookies.get('sanguoce_guest')!;
    assert.equal(token.length, 43); assert.equal(f.auth.calls, 0);
    assert.equal((await guest.me()).player.id, first.player.id);
    assert.equal((await guest.request('/api/player/profile', 'PATCH', { nickname: '测试游侠' })).status, 200);
    assert.equal((await guest.request('/api/player/profile', 'PATCH', { nickname: '\u0000' })).status, 400);
    const ticket = await guest.start(); const saved = await guest.save(ticket); assert.equal(saved.status, 201);
    const result = await saved.json() as { id: string; playerSaved: boolean }; assert.equal(result.playerSaved, true);
    assert.deepEqual(JSON.parse(await readFile(join(f.directory, 'traces', `${result.id}.json`), 'utf8')), game());
    await f.restart(); assert.equal((await guest.me()).player.nickname, '测试游侠');
    const history = await guest.history(); assert.equal(history.total, 1); assert.equal(history.wins, 1);
    assert.equal(history.points, 15); assert.equal((await guest.me()).player.points, 15);
    assert.equal(history.games[0].source, 'browser');
    const db = new DatabaseSync(join(f.directory, 'traces/players.sqlite'), { readOnly: true });
    try { assert.notEqual(db.prepare('SELECT token_hash FROM guest_sessions').get()!.token_hash, token); }
    finally { db.close(); }
    const other = f.actor(); assert.notEqual((await other.me()).player.id, guest.id);
    assert.equal((await other.history()).total, 0);
  } finally { await f.close(); }
});

test('共享博客会话自动识别且跨设备相同，自动登录不认领游客记录，主动认领撤销旧凭据', async () => {
  const f = await fixture();
  try {
    const browser = f.actor(); const guestId = (await browser.me()).player.id;
    const oldToken = browser.cookies.get('sanguoce_guest')!;
    const pending = await browser.start(8);
    assert.equal((await browser.save(await browser.start())).status, 201);
    browser.cookies.set('better-auth.session_token', 'alice');
    const member = await browser.me(); assert.equal(member.auth, 'signed-in');
    assert.equal(member.claimableGames, 1); assert.equal(member.claimableGuestId, guestId);
    assert.equal((await browser.history()).total, 0);
    assert.equal('email' in member.player, false);
    assert.equal((await browser.request('/api/player/claim', 'POST', { guestId: 'someone-else' })).status, 409);
    const secondDevice = f.actor('alice'); assert.equal((await secondDevice.me()).player.id, member.player.id);
    assert.equal((await secondDevice.history()).total, 0);
    assert.equal((await browser.request('/api/player/profile', 'PATCH', { nickname: '我的游戏昵称' })).status, 200);
    assert.equal((await browser.me()).player.nickname, '我的游戏昵称');
    const claimed = await browser.request('/api/player/claim', 'POST', { guestId }); assert.equal(claimed.status, 200);
    assert.equal((await claimed.json() as { count: number }).count, 1);
    assert.equal((await secondDevice.history()).total, 1);
    assert.equal((await secondDevice.history()).points, 15);
    assert.equal((await browser.request('/api/player/claim', 'POST', { guestId })).status, 409);
    assert.equal((await browser.save(pending, game(8))).status, 201, '已认领游客的进行中对局跟随账号');
    const stolenOldGuest = f.actor(); stolenOldGuest.cookies.set('sanguoce_guest', oldToken);
    assert.notEqual((await stolenOldGuest.me()).player.id, member.player.id);
    assert.equal((await stolenOldGuest.history()).total, 0);
    assert.equal((await secondDevice.history()).total, 2);
    assert.equal((await secondDevice.me()).player.points, 30, '认领及进行中对局的积分一起累积');
  } finally { await f.close(); }
});

test('开局归属不能被账号切换／伪造 ID 改写，结算并发重试只记录一次', async () => {
  const f = await fixture();
  try {
    const alice = f.actor('alice'); await alice.me(); const ticket = await alice.start();
    const bob = f.actor('bob'); await bob.me();
    assert.equal((await bob.save(ticket)).status, 409);
    assert.equal((await bob.request('/api/player/profile', 'PATCH', { nickname: '冒充' }, { 'X-Sanguoce-Player': alice.id })).status, 409);
    assert.equal((await bob.request('/api/player/history', 'GET', undefined, { 'X-Sanguoce-Player': alice.id })).status, 409);
    const saves = await Promise.all([alice.save(ticket), alice.save(ticket)]);
    assert.deepEqual(saves.map(reply => reply.status), [201, 201]);
    const ids = await Promise.all(saves.map(reply => reply.json() as Promise<{ id: string }>));
    assert.equal(ids[0].id, ids[1].id); assert.equal((await alice.history()).total, 1);
    assert.equal((await alice.history()).points, 15, '并发重试不重复发放积分');
    assert.equal((await alice.save(ticket, { ...game(), turn: 4 })).status, 400);
    const mismatch = await alice.start(9); assert.equal((await alice.save(mismatch)).status, 400);
    assert.equal((await bob.history()).total, 0);
    alice.cookies.set('better-auth.session_token', 'bob');
    assert.equal((await alice.save(ticket)).status, 409);
  } finally { await f.close(); }
});

test('认证故障不误认为退出登录，不写错战绩；过期会话和包装的 null 正常回落游客', async () => {
  const f = await fixture();
  try {
    const browser = f.actor('alice'); const memberId = (await browser.me()).player.id;
    f.auth.unavailable = true;
    const outage = await browser.me(); assert.equal(outage.auth, 'unavailable');
    assert.equal((await browser.request('/api/player/games', 'POST', { mode: 'duel', seed: 7 })).status, 503);
    assert.equal((await browser.request('/api/player/history')).status, 503);
    f.auth.unavailable = false; assert.equal((await browser.me()).player.id, memberId);
    f.auth.malformed = true; assert.equal((await browser.me()).auth, 'unavailable');
    f.auth.malformed = false;
    browser.cookies.set('better-auth.session_token', 'expired'); assert.equal((await browser.me()).auth, 'guest');
  } finally { await f.close(); }
});

test('登录复用 GitHub 回到游戏、转发认证 Cookie，退出后切换独立游客，写操作验证 Origin', async () => {
  const f = await fixture();
  try {
    const browser = f.actor(); await browser.me();
    const login = await browser.request('/api/player/login', 'POST', {}); assert.equal(login.status, 200);
    assert.equal(f.auth.callback, `${ORIGIN}/sanguoce/?account=login`);
    assert.match(login.headers.get('set-cookie')!, /better-auth.state/);
    browser.cookies.set('better-auth.session_token', 'alice'); await browser.me();
    const logout = await browser.request('/api/player/logout', 'POST', {}); assert.equal(logout.status, 200);
    assert.match(logout.headers.get('set-cookie')!, /better-auth.session_token=;.*Max-Age=0/);
    assert.equal((await browser.me()).auth, 'guest');
    assert.equal((await browser.history()).total, 0);
    assert.equal((await browser.request('/api/player/profile', 'PATCH', { nickname: 'bad' }, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await browser.request('/api/player/profile', 'PATCH', { nickname: 'bad' }, { origin: '' })).status, 403);
    assert.equal((await browser.request('/api/player/profile', 'PATCH', { nickname: 'bad' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await browser.request('/api/player/logout')).status, 405);
  } finally { await f.close(); }
});

test('个人历史分页去重，外人的游标和 SQLite 文件不公开', async () => {
  const f = await fixture();
  try {
    const a = f.actor(); await a.me();
    for (let i = 0; i < 23; i++) assert.equal((await a.save(await a.start(i), game(i))).status, 201);
    const first = await a.history(); assert.equal(first.total, 23); assert.equal(first.games.length, 20); assert.ok(first.nextCursor);
    const next = await a.request(`/api/player/history?cursor=${first.nextCursor}`);
    const second = await next.json() as PlayerHistory; assert.equal(second.games.length, 3); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.games, ...second.games].map(g => g.id)).size, 23);
    const b = f.actor(); await b.me();
    const foreign = await b.request(`/api/player/history?cursor=${first.nextCursor}`);
    assert.equal((await foreign.json() as PlayerHistory).games.length, 0);
    assert.equal((await a.request('/players.sqlite')).status, 404);
    assert.equal((await a.request('/traces/players.sqlite')).status, 404);
  } finally { await f.close(); }
});

test('完成不同模式累积积分，内奸胜利加分，浏览器自报积分无效且失败上传不入账', async () => {
  const f = await fixture();
  try {
    const player = f.actor(); await player.me();
    const fakeScore = { ...game(), earnedPoints: 1000000, reward: { total: 1000000 } };
    const duel = await player.save(await player.start(), fakeScore);
    assert.equal(duel.status, 201);
    const first = await duel.json() as { earnedPoints: number; totalPoints: number };
    assert.deepEqual(first.earnedPoints, 15); assert.equal(first.totalPoints, 15);
    const identity = { ...game(8), config: { seed: 8, mode: 'identity' },
      players: [{ id: 0, general: 'standard.caocao', label: '曹操', role: 'renegade' },
        { id: 1, label: '主公', role: 'lord' }] };
    const ticket = await player.start(8, 'identity');
    const saved = await player.save(ticket, identity); assert.equal(saved.status, 201);
    const result = await saved.json() as { earnedPoints: number; totalPoints: number; reward: { renegade: number } };
    assert.equal(result.earnedPoints, 140); assert.equal(result.totalPoints, 155); assert.equal(result.reward.renegade, 60);
    assert.equal((await player.save(ticket, identity)).status, 201);
    assert.equal((await player.history()).points, 155);
    const bad = await player.start(9);
    const malformed = { ...game(9), events: [{ kind: 'damaged', data: { source: 0, target: 0, amount: '10000' } }] };
    assert.equal((await player.save(bad, malformed)).status, 400);
    assert.equal((await player.history()).points, 155);
    const lost = { ...game(10), outcome: { status: 'draw', reason: 'no-survivors' } };
    assert.equal((await player.save(await player.start(10), lost)).status, 201);
    assert.equal((await player.me()).player.points, 160);
    const history = await player.history(); assert.equal(history.games.reduce((sum, g) => sum + g.earnedPoints, 0), history.points);
    await f.restart(); assert.equal((await player.me()).player.points, 160);
  } finally { await f.close(); }
});

test('公开积分榜按累计积分降序只取十名，不登录也能读且不依赖博客认证', async () => {
  const f = await fixture();
  try {
    const visitor = f.actor();
    const empty = await visitor.request('/api/player/leaderboard');
    assert.deepEqual(await empty.json(), { entries: [] });
    assert.equal(empty.headers.get('set-cookie'), null, '读取公开榜不创建游客');
    const ids: string[] = [];
    for (let i = 0; i < 12; i++) {
      const actor = f.actor(); await actor.me(); ids.push(actor.id);
      assert.equal((await actor.request('/api/player/profile', 'PATCH', { nickname: `排行测试${i}` })).status, 200);
      for (let n = 0; n <= i; n++) assert.equal((await actor.save(await actor.start())).status, 201);
    }
    const zero = f.actor(); await zero.me();
    f.auth.unavailable = true;
    const blogVisitor = f.actor('alice');
    const reply = await blogVisitor.request('/api/player/leaderboard'); assert.equal(reply.status, 200);
    assert.equal(reply.headers.get('cache-control'), 'no-store');
    const board = await reply.json() as PlayerLeaderboard;
    assert.equal(board.entries.length, 10);
    assert.deepEqual(board.entries.map(e => e.points), [180, 165, 150, 135, 120, 105, 90, 75, 60, 45]);
    assert.deepEqual(board.entries.map(e => e.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(board.entries[0].id, ids[11]);
    assert.equal(board.entries[0].nickname, '排行测试11');
    assert.equal(f.auth.calls, 0);
    assert.ok(board.entries.every(e => Object.keys(e).sort().join(',') === 'id,kind,nickname,points,rank'));
    assert.equal((await visitor.request('/api/player/leaderboard', 'POST', {})).status, 405);
  } finally { await f.close(); }
});

test('排行榜同分顺序稳定，改名即时显示，游客认领合并后只保留一个上榜玩家', async () => {
  const f = await fixture();
  try {
    const a = f.actor(), b = f.actor(); await a.me(); await b.me();
    await a.save(await a.start()); await b.save(await b.start());
    const board = async () => await (await a.request('/api/player/leaderboard')).json() as PlayerLeaderboard;
    const tied = await board(); assert.deepEqual(await board(), tied);
    await a.request('/api/player/profile', 'PATCH', { nickname: '上榜新昵称' });
    assert.equal((await board()).entries.find(e => e.id === a.id)?.nickname, '上榜新昵称');
    const guestId = a.id;
    a.cookies.set('better-auth.session_token', 'alice'); await a.me();
    await a.save(await a.start());
    assert.equal((await a.request('/api/player/claim', 'POST', { guestId })).status, 200);
    const after = await board(); assert.equal(after.entries.length, 2);
    assert.equal(after.entries[0].id, a.id); assert.equal(after.entries[0].points, 30);
    assert.equal(after.entries[0].kind, 'member'); assert.ok(after.entries.every(e => e.id !== guestId));
    await f.restart(); assert.deepEqual(await board(), after);
  } finally { await f.close(); }
});

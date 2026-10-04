import test from 'node:test';
import assert from 'node:assert/strict';
import type { Observation } from '../contracts.ts';
import type { VisibleEvent } from '../src/domain/events.ts';
import type { AssetManifest } from '../src/web/assets.ts';
import { eventSounds, SoundCueRouter } from '../src/web/sound-cues.ts';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';

const manifest = {
  cards: {}, generals: {}, generalAudio: {
    'standard.zhaoyun': { skills: { 'standard.longdan': ['/longdan-1.mp3', '/longdan-2.mp3'] },
      aliases: { 'standard.longdan.sha': 'standard.longdan', 'standard.longdan.shan': 'standard.longdan' },
      death: '/zhaoyun-death.mp3' },
    'standard.zhouyu': { skills: { 'standard.yingzi': ['/yingzi-1.mp3', '/yingzi-2.mp3'] },
      aliases: {}, death: '/zhouyu-death.mp3' },
  },
  cardAudio: {
    juedou: { male: '/juedou-male.mp3', female: '/juedou-female.mp3' },
    sha: { male: '/sha-male.mp3', female: '/sha-female.mp3' },
    zhuge: { male: '/zhuge-male.mp3', female: '/zhuge-female.mp3' },
    shandian: { male: '/shandian-male.mp3', female: '/shandian-female.mp3' },
  },
  systemAudio: {
    raw_addhp: '/heal.mp3', raw_equip: '/equip.mp3',
    raw_hit_new: '/hit-a.mp3', raw_hit_new2: '/hit-b.mp3', raw_hit_old: '/hit-c.mp3',
    raw_hit_lei2: '/lightning.mp3', dead: '/dead.mp3',
  },
} satisfies AssetManifest;

const observation = {
  self: { id: 0, sex: 'male', general: 'standard.zhaoyun' },
  others: [{ id: 1, sex: 'female', general: 'standard.zhouyu' }],
  events: [],
  eventCards: { 11: { id: 11, name: 'juedou' }, 12: { id: 12, name: 'sha' },
    13: { id: 13, name: 'zhuge' }, 14: { id: 14, name: 'shandian' } },
  discardTop: null,
} as unknown as Observation;
const event = (kind: VisibleEvent['kind'], data: object): VisibleEvent =>
  ({ id: 1, kind, data }) as VisibleEvent;

test('出牌、响应和装备按卡牌与角色性别播放语音', () => {
  assert.deepEqual(eventSounds(event('cardUsed', { source: 1, card: 11, targets: [0] }), observation, manifest),
    ['/juedou-female.mp3']);
  assert.deepEqual(eventSounds(event('discarded', { player: 0, card: 12, reason: 'respond' }), observation, manifest),
    ['/sha-male.mp3']);
  assert.deepEqual(eventSounds(event('equipped', { player: 1, card: 13, replaced: false }), observation, manifest),
    ['/zhuge-female.mp3', '/equip.mp3']);
  assert.deepEqual(eventSounds(event('delayPlaced', { source: 0, target: 1, card: 14 }), observation, manifest),
    ['/shandian-male.mp3']);
  assert.deepEqual(eventSounds(event('equipped', { player: 1, card: 13, replaced: true }), observation, manifest), []);
});

test('诸葛亮和孙尚香装备麒麟弓时使用各自武将性别的语音，双方视角一致', () => {
  const voices = { ...manifest, cardAudio: { ...manifest.cardAudio,
    qilin: { male: '/qilin-male.mp3', female: '/qilin-female.mp3' },
  } };
  for (const actor of [0, 1]) {
    const f = fixture(2, { players: [
      { label: '诸葛亮', sex: 'female', general: 'standard.zhugeliang' },
      { label: '孙尚香', sex: 'male', general: 'standard.sunshangxiang' },
    ] });
    const bow = f.hand(actor, 'qilin');
    const before = f.start(actor);
    const play = legalActions(before).find(choice => choice.data?.type === 'play' && choice.data.cid === bow)!;
    const state = apply(before, play.id);
    for (const viewer of [0, 1]) {
      const obs = observe(state, viewer);
      const event = obs.events.find(event => event.kind === 'equipped' && event.data.card === bow)!;
      assert.deepEqual(eventSounds(event, obs, voices), [actor === 0 ? '/qilin-male.mp3' : '/qilin-female.mp3', '/equip.mp3']);
    }
  }
});

test('转化牌只播放生效后的牌名，直接救桃和无懈也有卡牌语音', () => {
  const converted = event('transformationUsed', { owner: 0, ability: 'standard.longdan',
    label: '龙胆', produces: 'sha' });
  const cost = event('discarded', { player: 0, card: 11, reason: 'respond' });
  const obs = { ...observation, events: [{ ...cost, id: 1 }, { ...converted, id: 2 }] } as Observation;
  assert.deepEqual(eventSounds(obs.events[0], obs, manifest), []);
  assert.deepEqual(eventSounds(obs.events[1], obs, manifest), ['/longdan-1.mp3', '/sha-male.mp3']);
  assert.deepEqual(eventSounds(event('abilityActivated', { owner: 1, ability: 'zhangba', effect: 'virtualSha' }),
    observation, manifest), ['/sha-female.mp3']);
  const withUseVoices = { ...manifest, cardAudio: {
    ...manifest.cardAudio, tao: { male: '/tao.mp3' }, wuxie: { male: '/wuxie.mp3' },
  } };
  const withUseCards = { ...observation, eventCards: { ...observation.eventCards,
    15: { id: 15, name: 'tao' }, 16: { id: 16, name: 'wuxie' } } } as unknown as Observation;
  assert.deepEqual(eventSounds(event('discarded', { player: 0, card: 15, reason: 'use' }),
    withUseCards, withUseVoices), ['/tao.mp3']);
  assert.deepEqual(eventSounds(event('discarded', { player: 0, card: 16, reason: 'use' }),
    withUseCards, withUseVoices), ['/wuxie.mp3']);
});

test('回血、伤害、闪电与死亡使用对应系统音效', () => {
  assert.deepEqual(eventSounds(event('drawn', { player: 0, count: 2 }), observation, manifest), []);
  assert.deepEqual(eventSounds(event('recovered', { player: 0, amount: 1 }), observation, manifest), ['/heal.mp3']);
  const damage = (card: number | null) => event('damaged', {
    target: 0, source: 1, amount: 1, hp: 3, maxHp: 4, card,
  });
  assert.deepEqual(eventSounds(damage(12), observation, manifest, () => 0), ['/hit-a.mp3']);
  assert.deepEqual(eventSounds(damage(12), observation, manifest, () => 0.5), ['/hit-b.mp3']);
  assert.deepEqual(eventSounds(damage(12), observation, manifest, () => 0.99), ['/hit-c.mp3']);
  assert.deepEqual(eventSounds(damage(14), observation, manifest, () => 0), ['/lightning.mp3']);
  assert.deepEqual(eventSounds(event('died', { target: 0 }), observation, manifest), ['/zhaoyun-death.mp3']);
});

test('武将技能语音按武将和技能轮流播放两个版本，死亡使用该武将语音', () => {
  const router = new SoundCueRouter(manifest);
  const yingzi = event('skillActivated', { owner: 1, ability: 'standard.yingzi', label: '英姿', targets: [] });
  assert.deepEqual(router.sounds(yingzi, observation), ['/yingzi-1.mp3']);
  assert.deepEqual(router.sounds(yingzi, observation), ['/yingzi-2.mp3']);
  assert.deepEqual(router.sounds(yingzi, observation), ['/yingzi-1.mp3']);
  const longdan = event('transformationUsed', { owner: 0, ability: 'standard.longdan.sha',
    label: '龙胆', produces: 'sha' });
  assert.deepEqual(router.sounds(longdan, observation), ['/longdan-1.mp3', '/sha-male.mp3']);
  assert.deepEqual(router.sounds({ ...longdan, data: { ...longdan.data, ability: 'standard.longdan.shan' } } as VisibleEvent,
    observation), ['/longdan-2.mp3', '/sha-male.mp3']);
  assert.deepEqual(router.sounds(event('died', { target: 1 }), observation), ['/zhouyu-death.mp3']);
  const replaced = event('judgementReplaced', { player: 1, owner: 0, reason: 'bagua',
    oldCard: 11, newCard: 12, ability: 'standard.longdan', label: '龙胆' });
  assert.deepEqual(router.sounds(replaced, observation), ['/longdan-1.mp3']);
});

test('实际闪电判定的公开观察值能识别雷击音效', () => {
  const f = fixture();
  const bolt = f.take('shandian');
  f.state.players[1].judge.push(bolt);
  f.top('sha', 'spade', 7);
  const start = f.start();
  const endPlay = legalActions(start).find(choice => choice.data?.type === 'endPlay');
  assert.ok(endPlay);
  const state = apply(start, endPlay.id);
  const obs = observe(state, 0);
  const damage = obs.events.find(item => item.kind === 'damaged' && item.data.card === bolt);
  assert.ok(damage);
  assert.deepEqual(eventSounds(damage, obs, manifest), ['/lightning.mp3']);
});

for (const sameSex of [false, true]) test(`决斗双方每次出杀恰好一次语音（${sameSex ? '相同' : '不同'}性别）`, () => {
  const f = fixture();
  if (sameSex) f.state.players[1].sex = 'male';
  const duel = f.hand(0, 'juedou');
  const cards = [f.hand(1, 'sha'), f.hand(0, 'sha'), f.hand(1, 'sha'), f.hand(0, 'sha')];
  let state = f.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === duel);
  assert.ok(play);
  state = apply(state, play.id);
  for (const card of cards) {
    const before = Math.max(...observe(state, 0).events.map(event => event.id));
    const respond = legalActions(state).find(choice => choice.data?.type === 'respond' && choice.data.ids.includes(card));
    assert.ok(respond);
    state = apply(state, respond.id);
    const obs = observe(state, 0);
    const events = obs.events.filter(event => event.id > before);
    const responder = events.find(event => event.kind === 'duelResponded');
    assert.ok(responder?.kind === 'duelResponded');
    const expected = state.players[responder.data.player].sex === 'male' ? '/sha-male.mp3' : '/sha-female.mp3';
    assert.deepEqual(events.flatMap(event => eventSounds(event, obs, manifest)), [expected]);
    assert.deepEqual(eventSounds(responder, obs, manifest), [expected]);
  }
});

for (const conversion of ['longdan', 'zhangba'] as const) test(`决斗${conversion === 'longdan' ? '龙胆' : '丈八'}转化只播一次杀，不播费用牌原名`, () => {
  const f = fixture(2, { players: [
    { label: '甲', sex: 'male' }, { label: '乙', sex: 'male', general: 'standard.zhaoyun' },
  ] });
  const duel = f.hand(0, 'juedou');
  const cost = f.hand(1, conversion === 'longdan' ? 'shan' : 'tao');
  if (conversion === 'zhangba') { f.equip(1, 'zhangba', 'weapon'); f.hand(1, 'juedou'); }
  let state = f.start();
  const play = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === duel);
  assert.ok(play);
  state = apply(state, play.id);
  const before = Math.max(...observe(state, 0).events.map(event => event.id));
  const respond = legalActions(state).find(choice => choice.data?.type === 'respond' && choice.data.ids.includes(cost));
  assert.ok(respond);
  state = apply(state, respond.id);
  const obs = observe(state, 0);
  const sounds = obs.events.filter(event => event.id > before).flatMap(event => eventSounds(event, obs, manifest));
  assert.deepEqual(sounds, conversion === 'longdan' ? ['/longdan-1.mp3', '/sha-male.mp3'] : ['/sha-male.mp3']);
});

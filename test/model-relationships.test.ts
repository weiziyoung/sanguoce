import test from 'node:test';
import assert from 'node:assert/strict';
import { ChineseView } from '../chinese-view.ts';
import { observe, StandardRuleset } from '../engine.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { emitEvent } from '../src/domain/event-journal.ts';
import { publicInteractions } from '../src/domain/public-interactions.ts';
import { modelRelationships } from '../src/presentation/model-relationships.ts';
import { ChatCompletionsPolicy } from '../src/policies/chat-completions-policy.ts';
import { JevPolicy } from '../src/policies/jev-policy.ts';
import { fixture } from './support/scenario-builder.ts';

const roles = ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'];
const scenario = () => fixture(5, { mode: 'identity', roles });
const prompt = (actor: number) => ({ actor, kind: 'play', title: '选择行动', options: [
  { id: 'end', label: '结束出牌' }, { id: 'wait', label: '等待' },
] });
function hate(f: ReturnType<typeof scenario>, viewer: number, source = 2) {
  return modelRelationships(observe(f.state, viewer)).find(row => row.player.id === source)!;
}

for (const cards of ['standard', 'junzheng'] as const) {
  test(`${cards} 真实出杀伤害主公，忠臣仇恨+1、另一反贼仇恨-1，不重复记出杀与命中`, () => {
    const f = fixture(5, { mode: 'identity', roles, cards });
    const sha = f.hand(2, 'sha');
    f.equip(2, 'qinggang', 'weapon');
    const rules = new StandardRuleset(undefined, undefined, contentForCards(cards));
    let state = rules.apply(f.start(2), `play:${sha}:0`);
    while (rules.decision(state)?.kind === 'respond') state = rules.apply(state, 'respond:pass');
    const loyal = rules.observe(state, 1), rebel = rules.observe(state, 3);
    assert.equal(loyal.others.find(player => player.id === 2)?.role, undefined);
    const from = (obs: typeof loyal) => modelRelationships(obs).find(row => row.player.id === 2)!;
    assert.equal(from(loyal).hate, 1);
    assert.equal(from(rebel).hate, -1);
    assert.equal(loyal.publicInteractions?.find(pair => pair.source === 2 && pair.target === 0)?.attackHits, 1);
    const view = new ChineseView();
    assert.match(view.stateForDecision(loyal, prompt(1)), /你是忠臣：保护主公/);
    assert.match(view.stateForDecision(rebel, prompt(3)), /你是反贼：击杀主公/);
    assert.match(view.stateForDecision(rebel, prompt(3)), /玩家3（角色3）：仇恨-1/);
  });
}

test('全局摘要保留超过近期窗口的行为，多次读取不叠加；重新建局清空', () => {
  const f = scenario();
  emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 3, maxHp: 5, card: null });
  for (let i = 0; i < 45; i++) emitEvent(f.state, 'drawn', { player: i % 5, count: 1 });
  const observation = observe(f.state, 1);
  assert.equal(observation.events.some(event => event.kind === 'damaged'), false);
  assert.equal(hate(f, 1).hate, 1);
  assert.deepEqual(observe(f.state, 1), observation);
  assert.equal(hate(scenario(), 1).hate, 0);
  assert.equal(observation.publicInteractions?.length, 1);
});

test('救主和赠牌对忠臣友善、对反贼敌对，濒死救援不会额外重复记分', () => {
  const f = scenario();
  emitEvent(f.state, 'recovered', { source: 2, player: 0, amount: 1 });
  emitEvent(f.state, 'rescued', { source: 2, target: 0 });
  emitEvent(f.state, 'gained', { from: 2, to: 0, card: f.hand(2, 'tao'), hidden: true, cause: 'standard.rende' });
  assert.equal(hate(f, 1).hate, -1.5);
  assert.equal(hate(f, 3).hate, 1.5);
});

test('无懈保护与反制保护按层数和锦囊利害改变仇恨', () => {
  const f = scenario();
  const card = f.hand(2, 'wuxie');
  emitEvent(f.state, 'nullificationUsed', { player: 2, card, cname: 'juedou', target: 0, parityBefore: 0 });
  assert.equal(hate(f, 1).hate, -0.5);
  assert.equal(hate(f, 3).hate, 0.5);
  emitEvent(f.state, 'nullificationUsed', { player: 2, card, cname: 'juedou', target: 0, parityBefore: 1 });
  assert.equal(hate(f, 1).hate, 0);
});

test('物理过拆、乐不思蜀和虚拟兵粮都计入公开干扰，出杀未命中仍有敌意证据', () => {
  const f = scenario();
  emitEvent(f.state, 'cardUsed', { source: 2, card: f.hand(2, 'guohe'), targets: [0] });
  emitEvent(f.state, 'delayPlaced', { source: 2, target: 0, card: f.hand(2, 'lebu') });
  emitEvent(f.state, 'delayPlaced', { source: 2, target: 0, card: f.hand(2, 'sha'), effectiveName: 'bingliang' });
  emitEvent(f.state, 'attackDeclared', { source: 2, target: 0 });
  assert.equal(hate(f, 1).hate, 2.5);
  assert.equal(hate(f, 3).hate, -2.5);
});

test('流离、借刀强迫的出杀和伤害、连环传导及无来源伤害不冒充主动敌意', () => {
  const f = scenario();
  for (const cause of [{ redirectedBy: 4 }, { forcedBy: 4 }]) {
    emitEvent(f.state, 'attackDeclared', { source: 2, target: 0, ...cause });
    emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 2, maxHp: 5, card: null, ...cause });
  }
  emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 2, maxHp: 5, card: null, propagated: true });
  emitEvent(f.state, 'damaged', { source: null, target: 0, amount: 3, hp: 1, maxHp: 5, card: null });
  assert.equal(hate(f, 1).hate, 0);
});

test('隐藏身份和暗手牌变化不影响公开摘要、仇恨与完整请求', () => {
  const f = scenario();
  emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 3, maxHp: 5, card: null });
  const hidden = f.hand(4, 'sha');
  const view = new ChineseView();
  const request = () => view.choiceSet(observe(f.state, 1), prompt(1)).request();
  const before = request();
  [f.state.mode.roles[2], f.state.mode.roles[4]] = [f.state.mode.roles[4], f.state.mode.roles[2]];
  f.state.cards[hidden].name = 'tao';
  assert.deepEqual(request(), before);
  assert.doesNotMatch(JSON.stringify(before), /standard\.|后台真实身份/);
});

test('已公开阵营是基准，死亡队友曾受伤仍保留公开敌意，仇恨范围有限', () => {
  const f = scenario();
  f.state.mode.knownTo[2] = [0, 1, 2, 3, 4];
  assert.equal(hate(f, 1).baselineHate, 1);
  assert.equal(hate(f, 3).baselineHate, -1);
  emitEvent(f.state, 'damaged', { source: 2, target: 1, amount: 10, hp: 0, maxHp: 4, card: null });
  f.state.players[1].alive = false;
  f.state.mode.knownTo[1] = [0, 1, 2, 3, 4];
  assert.equal(hate(f, 0).hate, 5);
});

test('旧观察没有累计摘要时仍可依据近期公开事件生成仇恨，未知目标不猜身份', () => {
  const f = scenario();
  emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 3, maxHp: 5, card: null });
  const obs = observe(f.state, 3);
  delete obs.publicInteractions;
  assert.equal(modelRelationships(obs).find(row => row.player.id === 2)?.hate, -1);
  assert.equal(publicInteractions(obs.events).length, 1);
});

test('Chat 和 Jev 的实际请求共享逐坐席仇恨和身份目标，候选协议保持一致', async () => {
  const f = scenario();
  emitEvent(f.state, 'damaged', { source: 2, target: 0, amount: 1, hp: 3, maxHp: 5, card: null });
  const observation = observe(f.state, 3), decision = prompt(3);
  let chatState = '', jevState = '';
  const chat = new ChatCompletionsPolicy({ endpoint: 'https://chat.example/v1/chat/completions', model: 'test',
    fetcher: (async (_url, init) => {
      chatState = JSON.parse(String(init?.body)).messages[1].content;
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '方案一' } }] });
    }) as typeof fetch });
  const jev = new JevPolicy({ endpoint: 'https://jev.example/v1/systemone',
    fetcher: (async (_url, init) => {
      jevState = JSON.parse(String(init?.body)).state;
      return Response.json({ answers: { 本步行动: { choice: '方案一' } } });
    }) as typeof fetch });
  assert.equal(await chat.choose(observation, decision), 'end');
  assert.equal(await jev.choose(observation, decision), 'end');
  assert.equal(chatState.split('\n\n【当前合法行动】')[0], jevState);
  assert.match(jevState, /玩家3（角色3）：仇恨-1/);
  assert.match(jevState, /你是反贼：击杀主公/);
});

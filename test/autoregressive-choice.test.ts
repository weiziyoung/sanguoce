import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { AutoregressiveChoiceSet, buildDeepSeekFlashRequest,
  extractAutoregressiveChoice } from '../src/policies/autoregressive-choice.ts';

test('普通聊天请求只包含公开局面、胜利目标和完整合法行动', () => {
  const game = GameEngine.standard({ seed: 1, players: [
    { label: '座位1·甘宁', sex: 'male', general: 'standard.ganning' },
    { label: '座位2·孙权', sex: 'male', general: 'standard.sunquan' },
  ] });
  const decision = game.getDecision()!;
  const prompt = new AutoregressiveChoiceSet(game.getObservation(decision.actor), decision);
  const { messages } = prompt.request;
  assert.equal(prompt.request.model, 'deepseek-flash');
  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /你是玩家1（甘宁），你的目标是杀死玩家2（孙权）/);
  assert.match(messages[0].content, /只输出方案编号/);
  assert.match(messages[1].content, /【当前状态】/);
  assert.match(messages[1].content, /【当前合法行动】\n方案一：/);
  assert.equal((messages[1].content.match(/^方案[一二三四五六七八九十]+：/gmu) ?? []).length,
    game.getLegalActions().length);
  assert.doesNotMatch(JSON.stringify(prompt.request), /standard\.|jev-latest|使用后使你回复1点体力/);
});

test('只接受最终正文中的合法编号，并映射回引擎动作 ID', () => {
  const game = GameEngine.standard({ seed: 1 });
  const decision = game.getDecision()!;
  const prompt = new AutoregressiveChoiceSet(game.getObservation(decision.actor), decision);
  const key = Object.keys(prompt.localized.criteria)[0];
  const expected = prompt.localized.resolve(key).id;
  assert.equal(prompt.resolveResponse({ choices: [{ finish_reason: 'stop', message: {
    content: `  ${key}\n`, reasoning_content: '我考虑了其他方案',
  } }] }), expected);
  assert.equal(prompt.resolveResponse({ choices: [{ finish_reason: 'stop', message: {
    content: JSON.stringify({ choice: key }),
  } }] }), expected);
  for (const content of [`我选${key}`, '方案不存在', `${key}，因为更好`,
    JSON.stringify({ choice: key, reason: '测试' })]) {
    assert.throws(() => prompt.resolveResponse({ choices: [{ finish_reason: 'stop', message: { content } }] }));
  }
  assert.throws(() => prompt.resolveResponse({ choices: [{ finish_reason: 'length', message: { content: key } }] }),
    /未正常结束/);
  assert.throws(() => prompt.resolveResponse({ choices: [{ finish_reason: 'stop', message: {
    content: null, reasoning_content: key,
  } }] }), /没有输出方案编号/);
  assert.throws(() => extractAutoregressiveChoice({ choices: [] }, prompt.localized.criteria), /唯一的回答/);
});

test('聊天请求保留输入行动顺序，不附额外牌效提示', () => {
  const actions = [
    '使用【五谷丰登】♥3',
    '使用【桃】♥7',
    '使用【决斗】♠A → 目标：座位2·孙权',
    '结束出牌阶段',
  ];
  const keys = ['方案一', '方案二', '方案三', '方案四'];
  const criteria = Object.fromEntries(actions.map((action, index) => [keys[index], action]));
  const request = buildDeepSeekFlashRequest('测试用公开局面', '请选择合法行动', criteria);
  assert.equal(request.messages[1].content.split('【当前合法行动】\n')[1],
    actions.map((action, index) => `${keys[index]}：${action}`).join('\n'));
  assert.equal(request.thinking.type, 'enabled');
  assert.equal(request.reasoning_effort, 'low');
  assert.equal(request.max_tokens, 8192);
});

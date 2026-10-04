import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { MimoPolicy } from '../src/policies/mimo-policy.ts';

test('MiMo 策略发送公开局面并保存思考内容', async () => {
  const game = GameEngine.standard({ seed: 1, mode: 'duel', players: [
    { label: '座位1·甘宁', sex: 'male', general: 'standard.ganning' },
    { label: '座位2·甘宁', sex: 'male', general: 'standard.ganning' },
  ] });
  const decision = game.getDecision()!;
  let reasoning: unknown;
  const policy = new MimoPolicy({ apiKey: 'test-key', fetcher: async (url, init) => {
    assert.equal(url, 'https://api.xiaomimimo.com/v1/chat/completions');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'mimo-v2.6-flash');
    assert.equal(request.thinking.type, 'enabled');
    assert.equal(request.max_completion_tokens, 8192);
    assert.match(request.messages[0].content, /请简短思考/);
    assert.doesNotMatch(JSON.stringify(request), /standard\.ganning|reasoning_effort/);
    return Response.json({ model: 'mimo-v2.6-flash', choices: [{ finish_reason: 'stop',
      message: { content: '方案一', reasoning_content: '先判断合法行动' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }, onExchange(exchange) {
    reasoning = (exchange.response as { choices: { message: { reasoning_content: string } }[] })
      .choices[0].message.reasoning_content;
  } });
  const optionId = await policy.choose(game.getObservation(decision.actor), decision);
  assert.equal(reasoning, '先判断合法行动');
  assert.doesNotThrow(() => game.choose({ decisionId: decision.id!, optionId }));
});

test('MiMo 策略拒绝截断的回答', async () => {
  const game = GameEngine.standard({ seed: 1 });
  const decision = game.getDecision()!;
  const policy = new MimoPolicy({ apiKey: 'test-key', fetcher: async () => Response.json({
    choices: [{ finish_reason: 'length', message: { content: '' } }],
    usage: { completion_tokens: 8192 },
  }) });
  await assert.rejects(policy.choose(game.getObservation(decision.actor), decision), /length.*8192 tokens/);
});

test('MiMo Pro 使用指定模型并保留相同的决策请求', async () => {
  const game = GameEngine.standard({ seed: 1, mode: 'duel', players: [
    { label: '座位1·甘宁', sex: 'male', general: 'standard.ganning' },
    { label: '座位2·甘宁', sex: 'male', general: 'standard.ganning' },
  ] });
  const decision = game.getDecision()!;
  const policy = new MimoPolicy({ apiKey: 'test-key', model: 'mimo-v2.6-pro', fetcher: async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'mimo-v2.6-pro');
    assert.equal(request.thinking.type, 'enabled');
    assert.equal(request.max_completion_tokens, 8192);
    return Response.json({ model: 'mimo-v2.6-pro', choices: [{ finish_reason: 'stop',
      message: { content: '方案一', reasoning_content: '选择合法方案' } }] });
  } });
  const optionId = await policy.choose(game.getObservation(decision.actor), decision);
  assert.doesNotThrow(() => game.choose({ decisionId: decision.id!, optionId }));
});

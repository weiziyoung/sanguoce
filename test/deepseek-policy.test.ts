import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { DeepSeekPolicy } from '../src/policies/deepseek-policy.ts';

test('DeepSeek 策略只发送公开视角并返回引擎合法动作', async () => {
  const game = GameEngine.standard({ seed: 1, mode: 'duel', players: [
    { label: '座位1·甘宁', sex: 'male', general: 'standard.ganning' },
    { label: '座位2·甘宁', sex: 'male', general: 'standard.ganning' },
  ] });
  const decision = game.getDecision()!;
  let called = 0;
  let exchangeReasoning: unknown;
  const policy = new DeepSeekPolicy({ apiKey: 'test-key', fetcher: async (_input, init) => {
    called++;
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, 'deepseek-flash');
    assert.equal(request.reasoning_effort, 'low');
    assert.match(request.messages[0].content, /你是玩家1（甘宁）/);
    assert.doesNotMatch(JSON.stringify(request), /standard\.ganning/);
    return Response.json({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop',
      message: { content: '方案一', reasoning_content: '先判断合法行动' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20 } });
  }, onExchange(exchange) {
    exchangeReasoning = (exchange.response as { choices: { message: { reasoning_content: string } }[] })
      .choices[0].message.reasoning_content;
    assert.equal(exchange.request.model, 'deepseek-flash');
  } });
  const optionId = await policy.choose(game.getObservation(decision.actor), decision);
  assert.equal(called, 1);
  assert.equal(exchangeReasoning, '先判断合法行动');
  assert.doesNotThrow(() => game.choose({ decisionId: decision.id!, optionId }));
});

test('DeepSeek 策略拒绝截断的回答', async () => {
  const game = GameEngine.standard({ seed: 1 });
  const decision = game.getDecision()!;
  const policy = new DeepSeekPolicy({ apiKey: 'test-key', fetcher: async () => Response.json({
    choices: [{ finish_reason: 'length', message: { content: '' } }],
    usage: { completion_tokens: 8192 },
  }) });
  await assert.rejects(policy.choose(game.getObservation(decision.actor), decision), /length.*8192 tokens/);
});

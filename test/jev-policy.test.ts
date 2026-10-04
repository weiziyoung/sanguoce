import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { JevPolicy } from '../src/policies/jev-policy.ts';

function opening() {
  const game = GameEngine.standard({ seed: 1, players: [
    { label: '甘宁', sex: 'male', general: 'standard.ganning' },
    { label: '孙权', sex: 'male', general: 'standard.sunquan' },
  ] });
  const decision = game.getDecision()!;
  return { game, decision, observation: game.getObservation(decision.actor) };
}

test('Jev 策略发送公开局面和完整候选，返回合法叶子动作', async () => {
  const { game, decision, observation } = opening();
  let requests = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer test-key');
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, 'jev-latest');
    assert.match(body.state, /当前行动者：玩家1（甘宁）/);
    assert.match(JSON.stringify(body.questions.本步行动.criteria), /奇袭.*目标：孙权/);
    assert.doesNotMatch(JSON.stringify(body), /standard\.|\b(sha|shan)\b/);
    return Response.json({ model: 'jev-test', answers: {
      本步行动: { type: 'choice', choice: '方案六', probabilities: {}, confidence: 1 },
    }, usage: { input_tokens: 1, output_tokens: 1 } });
  }) as typeof fetch;
  const selected = await new JevPolicy({ apiKey: 'test-key', fetcher }).choose(observation, decision);
  assert.equal(requests, 1);
  assert.ok(game.getLegalActions().some(choice => choice.id === selected));
  game.choose({ decisionId: decision.id!, optionId: selected });
});

test('Jev 错误响应和非法候选不会回退成规则 AI 行动', async () => {
  const { decision, observation } = opening();
  const unauthorized = (async () => new Response('', { status: 401 })) as typeof fetch;
  await assert.rejects(new JevPolicy({ apiKey: 'test-key', fetcher: unauthorized }).choose(observation, decision),
    /认证失败（HTTP 401）/);
  const invalid = (async () => Response.json({ answers: { 本步行动: { type: 'choice', choice: '方案不存在' } } })) as typeof fetch;
  await assert.rejects(new JevPolicy({ apiKey: 'test-key', fetcher: invalid }).choose(observation, decision),
    /非法候选/);
  assert.throws(() => new JevPolicy({ apiKey: '' }), /缺少 JEV_API_KEY/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { ChatCompletionsPolicy } from '../src/policies/chat-completions-policy.ts';
import { JevPolicy } from '../src/policies/jev-policy.ts';
import { modelEndpoint } from '../src/policies/model-endpoint.ts';

function opening() {
  const game = GameEngine.junzheng({ seed: 1 });
  const decision = game.getDecision()!;
  return { game, decision, observation: game.getObservation(decision.actor) };
}
const answer = { choices: [{ finish_reason: 'stop', message: { content: '方案一' } }] };

test('自定义 Chat 请求使用独立模型和地址，发送公开局面、完整合法方案，解析正文', async () => {
  const { game, decision, observation } = opening();
  const fetcher = (async (url, init) => {
    assert.equal(url, 'https://chat.example/v1/chat/completions');
    assert.equal(init?.method, 'POST');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer chat-key');
    assert.equal(init?.credentials, 'omit');
    assert.ok(init?.signal);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'my-model');
    assert.equal(body.stream, false);
    assert.deepEqual(Object.keys(body).sort(), ['messages', 'model', 'stream']);
    assert.equal(body.messages.length, 2);
    assert.match(body.messages[1].content, /【当前合法行动】\n方案一：/);
    assert.doesNotMatch(JSON.stringify(body), /apiKey|chat-key|standard\.|jev-latest/);
    return Response.json({ ...answer, reasoning_content: '其他方案不会被提交' });
  }) as typeof fetch;
  const optionId = await new ChatCompletionsPolicy({ endpoint: 'https://chat.example/v1/chat/completions',
    model: 'my-model', apiKey: 'chat-key', fetcher }).choose(observation, decision);
  assert.ok(game.getLegalActions().some(choice => choice.id === optionId));
  game.choose({ decisionId: decision.id!, optionId });
});

test('自建 Chat 和 Jev 兼容服务允许免认证，Jev model/state/questions 与 Chat messages 分开', async () => {
  const { decision, observation } = opening();
  const chat = new ChatCompletionsPolicy({ endpoint: 'http://127.0.0.1:8000/v1/chat/completions', model: 'local',
    fetcher: (async (_url, init) => {
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      return Response.json(answer);
    }) as typeof fetch });
  await chat.choose(observation, decision);
  const jev = new JevPolicy({ endpoint: 'http://127.0.0.1:8000/v1/systemone', model: 'multilingual', apiKey: '',
    fetcher: (async (url, init) => {
      assert.equal(url, 'http://127.0.0.1:8000/v1/systemone');
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'multilingual');
      assert.ok(body.state && body.questions.本步行动.criteria);
      assert.equal(body.messages, undefined);
      return Response.json({ answers: { 本步行动: { choice: '方案一' } } });
    }) as typeof fetch });
  await jev.choose(observation, decision);
});

test('错误状态、非 JSON、无效方案及未正常完成均拒绝提交', async () => {
  const { decision, observation } = opening();
  for (const response of [new Response('', { status: 401 }), new Response('not-json'),
    Response.json({ choices: [{ finish_reason: 'stop', message: { content: '方案不存在' } }] }),
    Response.json({ choices: [{ finish_reason: 'length', message: { content: '方案一' } }] })]) {
    const policy = new ChatCompletionsPolicy({ endpoint: 'https://chat.example/v1/chat/completions', model: 'test',
      fetcher: (async () => response) as typeof fetch });
    await assert.rejects(policy.choose(observation, decision));
  }
});

test('校验完整 HTTP 地址、模型名和超时参数，唯一合法动作不请求模型', async () => {
  for (const endpoint of ['', '/api/chat', 'file:///tmp/secret', 'https://user:secret@chat.example/api', 'https://chat.example/api#fragment'])
    assert.throws(() => modelEndpoint(endpoint));
  assert.equal(modelEndpoint(' https://chat.example/v1/chat/completions '), 'https://chat.example/v1/chat/completions');
  assert.throws(() => new ChatCompletionsPolicy({ endpoint: 'https://chat.example/api', model: '' }), /模型名/);
  assert.throws(() => new ChatCompletionsPolicy({ endpoint: 'https://chat.example/api', model: 'test', timeoutMs: 0 }), /超时/);
  const { decision, observation } = opening();
  const forced = { ...decision, options: [{ id: 'only', label: '唯一行动' }] };
  const policy = new ChatCompletionsPolicy({ endpoint: 'https://chat.example/api', model: 'test',
    fetcher: (async () => { throw new Error('不应请求'); }) as typeof fetch });
  assert.equal(await policy.choose(observation, forced), 'only');
});

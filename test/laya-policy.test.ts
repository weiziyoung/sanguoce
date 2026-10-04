import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { LayaPolicy } from '../src/policies/laya-policy.ts';

test('本地 Laya 收到中文多语言请求，返回规则引擎可提交的动作', async () => {
  const game = GameEngine.standard({ seed: 1, players: [
    { label: '甘宁', sex: 'male', general: 'standard.ganning' },
    { label: '孙权', sex: 'male', general: 'standard.sunquan' },
  ] });
  const decision = game.getDecision()!;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, 'http://127.0.0.1:8000/v1/systemone');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, undefined);
    const body = JSON.parse(init?.body as string);
    assert.equal(body.model, 'multilingual');
    assert.match(body.state, /玩家1（甘宁）的技能：【奇袭】/);
    assert.equal(Object.keys(body.questions.本步行动.criteria).length, game.getLegalActions().length);
    return Response.json({ model: 'multilingual', answers: {
      本步行动: { type: 'choice', choice: '方案六', probabilities: {}, confidence: 1 },
    } });
  }) as typeof fetch;
  const selected = await new LayaPolicy({ fetcher }).choose(game.getObservation(decision.actor), decision);
  assert.ok(game.getLegalActions().some(option => option.id === selected));
  game.choose({ decisionId: decision.id!, optionId: selected });
});

test('Laya 网络错误不回退成规则 AI 决策', async () => {
  const game = GameEngine.standard({ seed: 1 });
  const decision = game.getDecision()!;
  const fetcher = (async () => new Response('', { status: 500 })) as typeof fetch;
  await assert.rejects(new LayaPolicy({ fetcher }).choose(game.getObservation(decision.actor), decision),
    /Laya 请求失败（HTTP 500）/);
});

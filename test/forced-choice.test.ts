import test from 'node:test';
import assert from 'node:assert/strict';
import type { Decision } from '../contracts.ts';
import { GameEngine } from '../engine.ts';
import { forcedActionId } from '../src/domain/forced-choice.ts';
import { JevPolicy } from '../src/policies/jev-policy.ts';
import { LayaPolicy } from '../src/policies/laya-policy.ts';
import { DeepSeekPolicy } from '../src/policies/deepseek-policy.ts';
import { MimoPolicy } from '../src/policies/mimo-policy.ts';

const nested: Decision = { actor: 0, kind: 'test', title: '测试', options: [
  { id: 'group', label: '组合行动', children: [
    { id: 'cost', label: '支付费用', children: [{ id: 'only-leaf', label: '唯一目标' }] },
  ] },
] };

test('只在完整合法叶子动作唯一时自动选择', () => {
  assert.equal(forcedActionId(nested), 'only-leaf');
  assert.equal(forcedActionId({ ...nested, options: [{ id: 'group', label: '组合行动', children: [
    { id: 'first', label: '目标一' }, { id: 'second', label: '目标二' },
  ] }] }), null);
  assert.equal(forcedActionId({ ...nested, options: [
    { id: 'first', label: '方案一' }, { id: 'second', label: '方案二' },
  ] }), null);
});

test('唯一合法叶子动作不触发任何模型 HTTP 调用', async () => {
  const game = GameEngine.standard({ seed: 1 });
  const observation = game.getObservation(0);
  const noFetch = (async () => { throw new Error('不应请求模型'); }) as typeof fetch;
  const policies = [
    new JevPolicy({ apiKey: 'test-key', fetcher: noFetch }),
    new LayaPolicy({ fetcher: noFetch }),
    new DeepSeekPolicy({ apiKey: 'test-key', fetcher: noFetch }),
    new MimoPolicy({ apiKey: 'test-key', fetcher: noFetch }),
  ];
  for (const policy of policies) assert.equal(await policy.choose(observation, nested), 'only-leaf');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { AiController } from '../src/web/ai-controller.ts';
import { AiSettingsPanel } from '../src/web/ai-settings-panel.ts';
import { GameSettings, SETTINGS_KEY, AI_CREDENTIALS_KEY, DEFAULT_PREFERENCES } from '../src/web/settings.ts';
import { BrowserDuel } from '../src/app/browser-duel.ts';
import { BrowserIdentity } from '../src/app/browser-identity.ts';
import { forcedActionId } from '../src/domain/forced-choice.ts';
import { GameEngine } from '../engine.ts';

function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
function computerTurn(mode: 'duel' | 'identity' = 'identity', cards: 'standard' | 'junzheng' = 'standard') {
  const session = mode === 'duel' ? new BrowserDuel(1, cards) : new BrowserIdentity(1, cards);
  session.start(session.candidates[0].id);
  for (let step = 0; step < 200; step++) {
    const decision = session.decision!;
    if (decision.actor !== session.humanSeat && forcedActionId(decision) === null) return session;
    if (decision.actor === session.humanSeat) session.choose(session.policy.choose(session.observation, decision), decision.id!);
    else session.computerStep();
  }
  throw new Error('没有找到电脑可选决策');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const chatAnswer = () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: '方案一' } }] });
const jevAnswer = () => Response.json({ answers: { 本步行动: { choice: '方案一' } } });
function chatSettings() {
  const settings = new GameSettings();
  settings.update({ aiProvider: 'chat', chatEndpoint: 'https://chat.example/v1/chat/completions', chatModel: 'chat-test', chatApiKey: 'chat-secret' });
  return settings;
}

test('AI 配置跨刷新恢复，两个协议的密钥独立存入 sessionStorage，关闭标签页不恢复密钥', () => {
  const local = storage(), session = storage();
  local.data.set('other', 'keep');
  const settings = new GameSettings(local, session);
  settings.update({ aiProvider: 'chat', chatEndpoint: 'https://chat.example/api', chatModel: 'test',
    chatApiKey: 'chat-secret', jevApiKey: 'jev-secret' });
  assert.deepEqual(new GameSettings(local, session).value, settings.value);
  assert.doesNotMatch(local.data.get(SETTINGS_KEY)!, /secret|ApiKey/);
  assert.match(session.data.get(AI_CREDENTIALS_KEY)!, /chat-secret/);
  const newTab = new GameSettings(local);
  assert.equal(newTab.value.chatApiKey, '');
  assert.equal(newTab.value.jevApiKey, '');
  assert.equal(newTab.value.chatModel, 'test');
  settings.reset();
  assert.deepEqual(new GameSettings(local, session).value, DEFAULT_PREFERENCES);
  assert.equal(local.data.get('other'), 'keep');
});

for (const mode of ['duel', 'identity'] as const) for (const cards of ['standard', 'junzheng'] as const)
  test(`${mode}/${cards} 电脑按行动者视角调用 Chat，等待返回后仅提交一次并保存合法动作`, async () => {
    const session = computerTurn(mode, cards);
    const settings = chatSettings();
    const called = deferred<void>(), response = deferred<Response>();
    const actor = session.decision!.actor;
    const count = session.record!.choices.length;
    const before = session.decision!.id;
    const controller = new AiController(settings, (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.match(body.messages[1].content, new RegExp(`当前行动者：玩家${actor + 1}`));
      assert.doesNotMatch(JSON.stringify(body), /chat-secret|jev-secret/);
      called.resolve();
      return response.promise;
    }) as typeof fetch);
    const pending = controller.step(session);
    await called.promise;
    assert.equal(session.decision!.id, before);
    assert.equal(session.record!.choices.length, count);
    settings.setOpen(true);
    response.resolve(chatAnswer());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(session.decision!.id, before, '设置打开时模型返回也不能推进');
    settings.setOpen(false);
    await pending;
    assert.notEqual(session.decision!.id, before);
    assert.equal(session.record!.choices.length, count + 1);
    assert.equal(session.record!.choices.at(-1)!.actor, actor);
    assert.equal(session.record!.choices.at(-1)!.human, false);
    assert.doesNotMatch(JSON.stringify(session.record!.config), /secret|ApiKey|Endpoint/);
    controller.dispose();
  });

test('默认规则策略不调用网络，选择结果与现有同步会话一致', async () => {
  const session = computerTurn(), direct = computerTurn();
  const controller = new AiController(new GameSettings(), (async () => { throw new Error('不应请求'); }) as typeof fetch);
  direct.computerStep();
  await controller.step(session);
  assert.deepEqual(session.observation, direct.observation);
  assert.deepEqual(session.record!.choices, direct.record!.choices);
  controller.dispose();
});

test('Jev 使用同源固定代理，自定义 Jev 地址直接调用；密钥只进入请求头', async () => {
  const session = computerTurn();
  const settings = new GameSettings();
  settings.update({ aiProvider: 'jev', jevApiKey: 'jev-secret' });
  let calls = 0;
  const fetcher = (async (url, init) => {
    calls++;
    assert.equal(url, calls === 1 ? '/api/ai/jev' : 'https://jev.example/v1/systemone');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer jev-secret');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, calls === 1 ? 'jev-latest' : 'local-jev');
    assert.ok(body.questions.本步行动.criteria);
    assert.equal(body.messages, undefined);
    return jevAnswer();
  }) as typeof fetch;
  const controller = new AiController(settings, fetcher);
  await controller.step(session);
  settings.update({ jevEndpoint: 'https://jev.example/v1/systemone', jevModel: 'local-jev' });
  const other = computerTurn();
  await controller.step(other);
  assert.equal(calls, 2);
  controller.dispose();
});

test('网络、超时、认证、非法方案错误保持当前决策，可重试成功或切回规则', async () => {
  for (const error of [new TypeError('fetch failed'), new DOMException('timeout', 'TimeoutError'),
    new Error('认证失败'), new Error('模型输出的方案编号不在当前合法行动中')]) {
    const session = computerTurn(), before = session.decision!.id, count = session.record!.choices.length;
    const settings = chatSettings();
    let success = false;
    const controller = new AiController(settings, (async () => { if (!success) throw error; return chatAnswer(); }) as typeof fetch);
    await assert.rejects(controller.step(session));
    assert.equal(session.decision!.id, before);
    assert.equal(session.record!.choices.length, count);
    success = true;
    await controller.step(session);
    assert.equal(session.record!.choices.length, count + 1);
    controller.dispose();
  }
});

test('请求中切换配置会取消旧调用，旧响应不提交，关闭设置后重新使用所选策略', async () => {
  const session = computerTurn(), direct = computerTurn();
  const settings = chatSettings();
  const called = deferred<void>(), response = deferred<Response>();
  let requestSignal: AbortSignal | null | undefined;
  const before = session.decision!.id;
  const controller = new AiController(settings, (async (_url, init) => {
    requestSignal = init?.signal; called.resolve(); return response.promise;
  }) as typeof fetch);
  const pending = controller.step(session);
  await called.promise;
  settings.setOpen(true);
  settings.update({ aiProvider: 'rule' });
  assert.equal(requestSignal?.aborted, true);
  response.resolve(chatAnswer());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.decision!.id, before);
  direct.computerStep();
  settings.setOpen(false);
  await pending;
  assert.deepEqual(session.observation, direct.observation);
  controller.dispose();
});

test('退出场景取消未完成请求，过期模型决策不提交且不写入记录', async () => {
  const session = computerTurn(), before = session.decision!.id, count = session.record!.choices.length;
  const called = deferred<void>(), response = deferred<Response>();
  const controller = new AiController(chatSettings(), (async () => { called.resolve(); return response.promise; }) as typeof fetch);
  const pending = controller.step(session);
  await called.promise;
  controller.dispose(); response.resolve(chatAnswer());
  await pending;
  assert.equal(session.decision!.id, before);
  assert.equal(session.record!.choices.length, count);
  const stale = deferred<string>();
  const old = session.computerStep({ choose: () => stale.promise });
  session.computerStep();
  const committed = session.record!.choices.length;
  stale.resolve(session.record!.choices.at(-1)!.optionId);
  await assert.rejects(Promise.resolve(old), /过期/);
  assert.equal(session.record!.choices.length, committed);
});

test('唯一合法动作在模型配置不完整时直接执行，跳过网络和费用', async () => {
  const game = GameEngine.standard({ seed: 1 });
  const decision = { ...game.getDecision()!, options: [{ id: 'only', label: '唯一行动' }] };
  const settings = new GameSettings();
  settings.update({ aiProvider: 'chat' });
  const noFetch = (async () => { throw new Error('不应请求'); }) as typeof fetch;
  let selected: string | undefined;
  const controller = new AiController(settings, noFetch);
  const session = { decision, computerStep: async (policy, beforeCommit) => {
    selected = await policy!.choose(game.getObservation(0), decision);
    await beforeCommit?.();
  } } as Pick<BrowserDuel, 'decision' | 'computerStep'> as BrowserDuel;
  await controller.step(session);
  assert.equal(selected, 'only');
  controller.dispose();
});

test('实际 AI 控件切换协议、分别保存字段、测试响应和重置', async () => {
  class Control {
    value = ''; disabled = false; textContent = ''; classes = new Set<string>(); onclick?: () => void;
    classList = { toggle: (name: string, active: boolean) => { if (active) this.classes.add(name); else this.classes.delete(name); } };
    listeners = new Map<string, (() => void)[]>();
    addEventListener(name: string, handler: () => void) { this.listeners.set(name, [...this.listeners.get(name) ?? [], handler]); }
    fire(name: string) { for (const handler of this.listeners.get(name) ?? []) handler(); }
  }
  const controls = new Map<string, Control>();
  const get = (id: string) => { if (!controls.has(id)) controls.set(id, new Control()); return controls.get(id)!; };
  const previous = globalThis.document;
  Object.assign(globalThis, { document: { getElementById: get } });
  try {
    const settings = new GameSettings(storage(), storage());
    const done = deferred<void>();
    new AiSettingsPanel(settings, (async () => { done.resolve(); return chatAnswer(); }) as typeof fetch);
    assert.equal(get('setting-aiProvider').value, 'rule');
    assert.equal(get('settings-test-ai').disabled, true);
    get('setting-aiProvider').value = 'chat'; get('setting-aiProvider').fire('change');
    assert.equal(get('ai-fields-chat').classes.has('hidden'), false);
    assert.equal(get('ai-fields-jev').classes.has('hidden'), true);
    for (const [key, value] of Object.entries({ chatEndpoint: 'https://chat.example/api', chatModel: 'test', chatApiKey: 'secret' })) {
      get(`setting-${key}`).value = value; get(`setting-${key}`).fire('change');
    }
    get('settings-test-ai').onclick!();
    await done.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.match(get('settings-ai-status').textContent, /连接成功.*ms/);
    get('setting-aiProvider').value = 'jev'; get('setting-aiProvider').fire('change');
    assert.equal(get('setting-jevApiKey').value, '');
    assert.equal(settings.value.chatApiKey, 'secret');
    assert.equal(get('settings-ai-status').textContent, '');
    settings.reset();
    assert.equal(get('setting-aiProvider').value, 'rule');
    assert.equal(get('setting-chatApiKey').value, '');
    assert.equal(get('settings-test-ai').disabled, true);
  } finally { Object.assign(globalThis, { document: previous }); }
});

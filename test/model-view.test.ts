import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.ts';
import { ChineseView, LocalizedChoiceSet } from '../chinese-view.ts';
import { standardGeneralDefinitions, standardGeneralSkills } from '../src/content/standard/generals.ts';
import { STANDARD_MODEL_GENERALS } from '../src/presentation/standard-model-metadata.ts';

const view = new ChineseView();

test('模型局面说明当前身份、武将技能与回合行动信息，且不发送内部标识', () => {
  const game = GameEngine.standard({ seed: 1, players: [
    { label: '甲', sex: 'male', general: 'standard.ganning' },
    { label: '乙', sex: 'male', general: 'standard.sunquan' },
  ] });
  const decision = game.getDecision()!;
  const request = view.choiceSet(game.getObservation(decision.actor), decision).request();
  assert.match(request.state, /1v1对决/);
  assert.match(request.state, /当前行动者：玩家1（甲（甘宁））/);
  assert.match(request.state, /本回合已使用【杀】0次/);
  assert.match(request.state, /【奇袭】你可以将一张黑色牌当做【过河拆桥】使用/);
  assert.match(request.state, /玩家2（乙（孙权））的技能：【制衡】/);
  assert.match(request.state, /1\. 甲摸了4张牌。\n2\. 乙摸了4张牌。\n3\. 第1回合，甲开始行动。\n4\. 甲摸了2张牌。/);
  assert.match(request.questions.本步行动.instructions, /你是玩家1（甲（甘宁）），你的目标是杀死玩家2（乙（孙权））取得胜利/);
  assert.ok(Object.values(request.questions.本步行动.criteria).every(label => !/（[^（）]+。）$/u.test(label)));
  assert.doesNotMatch(JSON.stringify(request), /standard\.|\b(sha|shan|guohe)\b/);
});

test('身份局模型局面只展示行动者已知身份，并覆盖全部标准武将技能说明', () => {
  const game = GameEngine.standard({ mode: 'identity', seed: 7,
    players: Array.from({ length: 5 }, (_, index) => ({
      label: `角色${index + 1}`, sex: 'male' as const, general: 'standard.ganning',
    })) });
  const own = game.getObservation(2);
  const decision = { ...game.getDecision()!, actor: 2 };
  const state = view.stateForDecision(own, decision);
  assert.match(state, /你：玩家3（角色3（甘宁））.*【反贼】/);
  assert.match(state, /玩家1（角色1（甘宁））.*【主公】/);
  assert.match(state, /玩家2（角色2（甘宁））.*【未知】/);
  assert.doesNotMatch(state, /忠臣|内奸/);

  for (const general of standardGeneralDefinitions) {
    const metadata = STANDARD_MODEL_GENERALS[general.id];
    assert.equal(metadata?.label, general.label);
    assert.deepEqual(metadata.skills.map(([id]) => id), general.abilities);
    for (const [id, label] of metadata.skills) {
      assert.equal(label, standardGeneralSkills.find(skill => skill.id === id)?.label);
    }
    const duel = GameEngine.standard({ seed: 3, players: [
      { label: '甲', sex: general.sex ?? 'male', general: general.id },
      { label: '乙', sex: 'male', general: 'standard.sunquan' },
    ] });
    const prompt = duel.getDecision()!;
    const request = view.choiceSet(duel.getObservation(prompt.actor), prompt).request();
    assert.doesNotMatch(JSON.stringify(request), /standard\./, general.label);
  }
});

test('最近公开事件只展示最后六条，并明确按发生时间从早到晚编号', () => {
  const observation = gameObservation();
  const decision = { actor: 0, kind: 'play', title: '出牌', options: [{ id: 'pass', label: '结束出牌' }] };
  observation.log = Array.from({ length: 7 }, (_, index) => `事件${index + 1}`);
  const state = view.stateForDecision(observation, decision);
  assert.match(state, /【最近公开事件】以下按发生时间从早到晚排列：第1条最早，第6条最新。/);
  assert.match(state, /1\. 事件2。\n2\. 事件3。\n3\. 事件4。\n4\. 事件5。\n5\. 事件6。\n6\. 事件7。/);
  assert.doesNotMatch(state, /事件1/);
});

test('座位标签在玩家称呼中不重复，但保留事件里的座位来源', () => {
  const game = GameEngine.standard({ seed: 1, players: [
    { label: '座位1·赵云', sex: 'male', general: 'standard.zhaoyun' },
    { label: '座位2·孙权', sex: 'male', general: 'standard.sunquan' },
  ] });
  const decision = game.getDecision()!;
  const request = view.choiceSet(game.getObservation(decision.actor), decision).request();
  assert.match(request.state, /当前行动者：玩家1（赵云）/);
  assert.match(request.state, /玩家2（孙权）/);
  assert.doesNotMatch(request.state, /玩家1（座位1·赵云）|玩家2（座位2·孙权）/);
  assert.match(request.state, /座位1·赵云摸了/);
  assert.match(request.questions.本步行动.instructions, /你是玩家1（赵云），你的目标是杀死玩家2（孙权）取得胜利/);
});

test('装备技能事件使用中文名称，未知展示名称阻止模型请求', () => {
  const observation = gameObservation();
  const decision = {
    actor: 0, kind: 'play', title: '出牌', options: [{ id: 'private', label: '发动standard.qixi' }],
  };
  observation.log = ['甲发动【standard.hanbing】'];
  assert.match(view.stateForDecision(observation, decision), /甲发动【寒冰剑】/);
  observation.log = ['甲发动【standard.unknown】'];
  assert.throws(() => view.choiceSet(observation, decision), /事件展示名称缺失/);
  observation.log = [];
  assert.throws(() => view.choiceSet(observation, decision).request(), /模型请求包含内部标识/);
});

test('嵌套选牌、费用和目标展开为一次 Choice 的完整合法叶子动作', () => {
  const choices = new LocalizedChoiceSet('公开局面', [
    { id: 'parent', label: '使用【杀】', children: [
      { id: 'leaf-a', label: '目标：甲' },
      { id: 'leaf-b', label: '目标：乙' },
    ] },
    { id: 'skill', label: '发动【奇袭】', children: [
      { id: 'cost', label: '弃置手牌一', children: [
        { id: 'leaf-c', label: '目标：乙' },
      ] },
    ] },
    { id: 'pass', label: '结束出牌' },
  ]);
  const request = choices.request();
  assert.deepEqual(request.questions.本步行动.criteria, {
    方案一: '使用【杀】 → 目标：甲',
    方案二: '使用【杀】 → 目标：乙',
    方案三: '发动【奇袭】 → 弃置手牌一 → 目标：乙',
    方案四: '结束出牌',
  });
  assert.doesNotMatch(JSON.stringify(request), /leaf-a|leaf-b|leaf-c|parent|cost/);
  assert.equal(choices.resolve('方案三').id, 'leaf-c');
  assert.equal(choices.resolveResponse({ answers: { 本步行动: { choice: '方案二' } } }), 'leaf-b');
  assert.throws(() => choices.resolve('parent'), /非法候选/);
  assert.throws(() => choices.resolveResponse({ answers: { 本步行动: { choice: '方案五' } } }), /非法候选/);
  assert.throws(() => choices.resolveResponse({ answers: { 本步行动: {} } }), /格式错误/);
  assert.throws(() => choices.resolveResponse({ answers: {} }), /缺少行动答案/);
});

test('模型候选与规则引擎当前合法动作一一对应，返回的 ID 可直接提交', () => {
  const game = GameEngine.standard({ seed: 1, players: [
    { label: '甲', sex: 'male', general: 'standard.ganning' },
    { label: '乙', sex: 'male', general: 'standard.sunquan' },
  ] });
  const decision = game.getDecision()!;
  const choices = view.choiceSet(game.getObservation(decision.actor), decision);
  assert.deepEqual([...choices.map.values()].map(choice => choice.id), game.getLegalActions().map(choice => choice.id));
  const firstKey = choices.map.keys().next().value!;
  game.choose({ decisionId: decision.id!, optionId: choices.resolveResponse({
    answers: { 本步行动: { choice: firstKey } },
  }) });
  assert.notEqual(game.getDecision()?.id, decision.id);
});

test('模型候选只保留原始行动文本，不附加牌效说明', () => {
  const choices = new LocalizedChoiceSet('公开局面', [
    { id: 'use', label: '使用【桃】♥7', data: { type: 'play' } },
    { id: 'discard', label: '弃置【桃】♥7', data: { type: 'discard' } },
    { id: 'cancel', label: '取消发动', data: { type: 'cancel' } },
    { id: 'longdan', label: '龙胆：【杀】♠8当【闪】', data: { type: 'respond' } },
  ]).request().questions.本步行动.criteria;
  assert.deepEqual(choices, {
    方案一: '使用【桃】♥7',
    方案二: '弃置【桃】♥7',
    方案三: '取消发动',
    方案四: '龙胆：【杀】♠8当【闪】',
  });
});

test('超过 Jev Choice 上限时报错，不截断合法动作', () => {
  const options = Array.from({ length: 256 }, (_, index) => ({ id: `action-${index}`, label: `行动${index}` }));
  assert.equal(new LocalizedChoiceSet('公开局面', options.slice(0, 255)).map.size, 255);
  assert.throws(() => new LocalizedChoiceSet('公开局面', options), /256项.*255项上限/);
});

function gameObservation() {
  const game = GameEngine.standard({ seed: 1 });
  return game.getObservation(0);
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { allContent, type CardSet } from '../src/app/game-content.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import type { ContentChoiceContext } from '../src/domain/state.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
import { discardOwned } from '../src/rules/operations/cards.ts';
import { preparePlayScenario } from '../src/app/standard-game.ts';
import { promptResponse } from '../src/content/standard/flows/response-flow.ts';
import { beginNullify } from '../src/content/standard/flows/nullification-flow.ts';
import { beginDying } from '../src/rules/flows/dying-flow.ts';
import { DeckReorderFlow } from '../src/rules/flows/deck-reorder-flow.ts';
import { DistributionFlow } from '../src/rules/flows/distribution-flow.ts';
import { JudgementFlow } from '../src/rules/flows/judgement-flow.ts';
import { PindianFlow } from '../src/rules/flows/pindian-flow.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { beginAttackUse } from '../src/rules/flows/attack-use-flow.ts';
import type { ActionChoice } from '../src/presentation/choice-view.ts';
import { yijiangScene } from './support/yijiang2011-scenario.ts';
import { mountainScene } from './support/mountain-scenario.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { zonePickerPosition } from '../src/web/layout.ts';
import { tableSceneFixture } from './support/table-scene-fixture.ts';

const coveredAbilities = new Set<string>();
const skillId = (ability: string) => allContent.skills().find(skill => skill.id === ability ||
  skill.transformations?.some(transform => transform.id === ability))!.id;
function richScene(general: string, count: number, cards: CardSet) {
  const x = yijiangScene(count, cards, count === 5);
  for (let seat = 0; seat < count; seat++) x.general(seat, seat ? 'standard.caocao' : general);
  x.f.state.players[0].hp--;
  for (const [name, suit] of [['sha', 'heart'], ['sha', 'spade'], ['shan', 'heart'], ['shan', 'diamond'],
    ['tao', 'diamond'], ['wuzhong', 'heart'], ['guohe', 'club'], ['qinggang', 'spade'], ['lebu', 'club']] as const)
    x.f.hand(0, name, suit);
  x.f.equip(0, 'guanshi', 'weapon'); x.f.equip(0, 'bagua', 'armor');
  x.f.equip(0, 'zhuahuang', 'plusHorse'); x.f.equip(0, 'chitu', 'minusHorse');
  if (general === 'mountain.jiangwei') {
    // Keep at least one opponent in range to offer Tiaoxin.
    const horse = x.f.state.players[0].equip.plusHorse!;
    x.f.state.players[0].equip.plusHorse = null; x.f.state.deck.push(horse);
  }
  for (let seat = 1; seat < count; seat++) {
    for (let i = 0; i < 1 + seat % 3; i++) x.f.hand(seat, 'sha');
    if (seat % 2 === 0) x.f.state.players[seat].hp--;
  }
  if (general === 'mountain.dengai') {
    x.f.state.players[0].piles = { 'mountain.tuntian': [x.f.take('shan'), x.f.take('tao'), x.f.take('sha')] };
    x.f.state.players[0].gainedAbilities = ['mountain.jixi'];
  }
  if (general === 'fire.yanliangwenchou') x.f.state.skillUses = [{ owner: 0, ability: 'fire.shuangxiong.color', turn: x.f.state.turn, count: 1 }];
  const state = x.start();
  return { x, state };
}

/** Use the rendered event callbacks and enabled HUD controls to reach a legal leaf. */
function reach(ui: ReturnType<typeof tableSceneFixture>, choice: ActionChoice) {
  const model = ui.scene.model!;
  if (model.decision.kind === 'play' && choice.ability) ui.clickSkill(choice.ability);
  if (model.tuxiIntent && choice.ability === 'standard.tuxi') ui.node('context-actions').children[0].click();
  if (model.ganglieDiscardIntent && choice.cardIds.length) ui.node('context-actions').children[0].click();
  if (!ui.submitted.length && choice.zone === 'hand' && choice.slot !== undefined && !choice.cardIds.length) {
    const obs = observe(ui.state, model.decision.actor), picks = zonePickerChoices(obs, model);
    const index = picks.findIndex(pick => pick.choice.id === choice.id), pos = zonePickerPosition(index, picks.length, false);
    const back = ui.scene.objects.find(item => item.interactive && item.x === pos.x && item.y === pos.y && item.depth === 50 + index);
    assert.ok(back, '暗手牌必须有可点击牌背'); back.emit('pointerdown');
  }
  if (!ui.submitted.length) {
    for (const id of choice.cardIds) {
      if (ui.scene.cards.some(sprite => sprite.card.id === id)) ui.clickCard(id);
      else ui.clickEquipment(model.decision.actor, id);
      if (ui.submitted.length) break;
    }
  }
  if (!ui.submitted.length) for (const target of choice.targetIds) {
    if (!model.targets.includes(target)) ui.clickTarget(target);
  }
  if (!ui.submitted.length) {
    const contextual = ui.node('context-actions').children.find(button => button.textContent === choice.label);
    if (contextual) contextual.click();
    else if (choice.actionType === 'ignoreNullify') ui.node('ignore-nullify').click();
    else if (choice.actionType === 'pass' || choice.actionType === 'cancel' || choice.actionType === 'endPlay') ui.node('end-action').click();
    else ui.node('play-action').click();
  }
  assert.equal(ui.submitted.length, 1, choice.label);
  assert.equal(ui.submitted[0].id, choice.id, `${model.decision.kind}: ${choice.label}`);
}

const contentStages: [string, ContentChoiceContext][] = [
  ['yijiang2011.luoying', { timing: 'gain' }], ['yijiang2011.jiushi', { timing: 'flip' }],
  ['yijiang2011.shangshi', { timing: 'draw' }], ['yijiang2011.enyuan', { timing: 'pay', source: 1 }],
  ['yijiang2011.xuanhuo', { timing: 'take', target: 1 }], ['yijiang2011.xuanhuo', { timing: 'give', target: 1 }],
  ['yijiang2011.xinzhan', { timing: 'gain' }], ['yijiang2011.xinzhan', { timing: 'order' }],
  ['yijiang2011.xuanfeng', { timing: 'effect' }], ['yijiang2011.buyi', { timing: 'reveal', target: 1 }],
  ['yijiang2011.mingce', { timing: 'target', target: 1 }], ['yijiang2011.mingce', { timing: 'effect', target: 1, source: 0 }],
  ['wind.shensu', { timing: 'judge' }], ['wind.shensu', { timing: 'play' }],
  ['wind.tianxiang', { timing: 'damage', source: 1, amount: 1 }],
  ['wind.buqu', { timing: 'add' }], ['wind.buqu', { timing: 'remove' }], ['wind.leiji', { timing: 'target' }],
  ['fire.quhu', { timing: 'victim', target: 1 }], ['fire.jieming', { timing: 'target' }], ['fire.niepan', { timing: 'dying' }],
  ['forest.xingshang', { timing: 'inherit', target: 1 }], ['forest.fangzhu', { timing: 'target' }],
  ['forest.yinghun', { timing: 'target', amount: 2 }], ['forest.yinghun', { timing: 'discard', target: 1, amount: 2 }],
  ['forest.haoshi', { timing: 'cards', amount: 2, selectedIds: [] }], ['forest.haoshi', { timing: 'recipient', selectedIds: [] }],
  ['forest.benghuai', { timing: 'loss' }], ['forest.luanwu', { timing: 'chaos', remaining: [1] }],
  ...['judge', 'draw', 'play', 'discard'].map(mode => ['mountain.qiaobian', { timing: 'cost', mode }] as [string, ContentChoiceContext]),
  ['mountain.qiaobian', { timing: 'draw', remaining: [] }], ['mountain.qiaobian', { timing: 'move' }],
  ['mountain.tiaoxin', { timing: 'sha', target: 1 }], ['mountain.zhiji', { timing: 'recover' }],
  ['mountain.xiangle', { timing: 'cost', source: 1 }],
  ['mountain.fangquan', { timing: 'skip' }], ['mountain.fangquan', { timing: 'cost' }], ['mountain.fangquan', { timing: 'target' }],
  ['mountain.yinghun', { timing: 'target', amount: 2 }], ['mountain.yinghun', { timing: 'discard', target: 1, amount: 2 }],
  ['mountain.guzheng', { timing: 'return', target: 1, selectedIds: [] }],
  ['mountain.beige', { timing: 'cost', target: 1, source: 1 }], ['mountain.beige', { timing: 'discard', target: 1, amount: 2 }],
  ['mountain.huashen', { timing: 'initial' }], ['mountain.huashen', { timing: 'start' }], ['mountain.huashen', { timing: 'end' }],
  ['mountain.zhiba.offer', { timing: 'ask', target: 1 }], ['mountain.zhiba.offer', { timing: 'loot', target: 1 }],
];

for (const [ability, context] of contentStages) {
  test(`${allContent.requireSkill(ability).label}/${context.timing}/${context.mode ?? ''}：费用牌、目标和所有选项通过实际渲染回调可达`, () => {
    for (const count of [2, 5]) for (const cards of ['standard', 'junzheng'] as const) {
      const { x, state } = richScene('standard.caocao', count, cards);
      state.players[0].gainedAbilities = [ability];
      state.players[0].huashen = { generals: ['standard.guanyu', 'standard.zhenji'] };
      state.players[0].piles = { 'wind.buqu': [state.deck.pop()!, state.deck.pop()!] };
      state.players[1].equip.armor = state.deck.splice(state.deck.findIndex(id => state.cards[id].name === 'renwang'), 1)[0];
      if (ability === 'fire.quhu') {
        state.deck.push(state.players[0].equip.plusHorse!); state.players[0].equip.plusHorse = null;
      }
      const actualContext = structuredClone(context);
      if (ability === 'yijiang2011.xuanhuo' && context.timing === 'give' && count === 2) continue;
      if (ability === 'yijiang2011.xuanhuo' && context.timing === 'give') actualContext.selectedIds = [state.players[0].hand[0]];
      if (ability === 'yijiang2011.luoying') { const id = state.players[1].hand[0]; discardOwned(state, 1, id); actualContext.selectedIds = [id]; }
      if (ability === 'yijiang2011.jiushi') state.players[0].faceDown = true;
      if (ability === 'yijiang2011.shangshi') { state.deck.push(...state.players[0].hand); state.players[0].hand = []; }
      if (ability === 'yijiang2011.buyi') state.players[1].hp = 0;
      if (ability === 'yijiang2011.xinzhan') { const ids = state.deck.splice(-3); state.table.push(...ids); actualContext.privateCards = ids; actualContext.remaining = ids; actualContext.selectedIds = []; }

      if (ability === 'mountain.guzheng') {
        const discarded = [...state.players[1].hand];
        for (const id of discarded) discardOwned(state, 1, id);
        actualContext.selectedIds = discarded;
      }
      state.resolution = resolutionStack.initial();
      openContentChoice(state, 0, ability, actualContext); x.advance(state);
      assert.equal(decision(state)?.kind, 'contentChoice', ability);
      const ui = tableSceneFixture(state);
      try {
        const leaves = [...ui.scene.model!.leaves];
        assert.ok(leaves.length, ability);
        if (ability === 'wind.buqu' && context.timing === 'remove') {
          assert.equal(ui.scene.objects.filter(item => item.text === '不屈牌').length, 2);
          assert.ok(!ui.scene.objects.some(item => item.text === '田'));
        }
        for (const choice of leaves) {
          ui.load(state); ui.submitted.length = 0;
          for (const id of choice.cardIds) {
            const displayed = ui.scene.cards.filter(sprite => sprite.card.id === id);
            if (displayed.length) assert.equal(displayed.length, 1, `费用牌 ${id} 不应重复绘制`);
          }
          reach(ui, choice);
          assert.ok(legalActions(state).some(option => option.id === ui.submitted[0].id));
        }
      } finally { ui.dispose(); }
    }
  });
}

test('所有声明了内容选择的技能均纳入各阶段交互检查', () => {
  assert.deepEqual([...new Set(contentStages.map(([ability]) => ability))].sort(),
    allContent.skills().filter(skill => skill.choice).map(skill => skill.id).sort());
});

for (const [general, mode] of [['standard.zhenji', 'wanjian'], ['standard.zhaoyun', 'wanjian'],
  ['standard.guanyu', 'nanman'], ['standard.caocao', 'nanman'], ['fire.wolong', 'nullify'],
  ['standard.huatuo', 'dying'], ['standard.simayi', 'judgeReplace'], ['wind.zhangjiao', 'judgeReplace'],
  ['standard.zhugeliang', 'deckReorder'], ['standard.guojia', 'distribution']] as const) {
  test(`${allContent.general(general).label}/${mode}：响应、救援、改判、观星和分牌的全部合法选择可通过界面提交`, () => {
    for (const count of [2, 5]) for (const cards of ['standard', 'junzheng'] as const) {
      const { x, state } = richScene(general, count, cards);
      state.active = 1; state.resolution = resolutionStack.initial();
      if (general === 'standard.caocao') {
        state.deck.push(state.players[0].equip.weapon!);
        state.players[0].equip.weapon = state.deck.splice(state.deck.findIndex(id => state.cards[id].name === 'zhangba'), 1)[0];
      }
      if (mode === 'nullify') beginNullify(state, null, null, 1, 0, 'wuzhong');
      else if (mode === 'dying') { state.players[1].hp = 0; beginDying(state, 1); }
      else if (mode === 'judgeReplace') {
        const id = state.deck.splice(state.deck.findIndex(id => state.cards[id].name === 'shandian'), 1)[0];
        state.players[1].judge.push(id);
        new JudgementFlow(x.runtime).begin(state, 1, 'shandian', { kind: 'applyDelayedJudgement', owner: 1, cid: id });
      }
      else if (mode === 'deckReorder') new DeckReorderFlow().begin(state, 0, 'standard.guanxing', count);
      else if (mode === 'distribution') new DistributionFlow().begin(state, 0, 'standard.yiji');
      else promptResponse(state, { mode, actor: 0, source: 1 });
      x.advance(state);
      const expected = mode === 'wanjian' || mode === 'nanman' ? 'respond' : mode;
      assert.equal(decision(state)?.kind, expected);
      assert.equal(decision(state)?.actor, 0);
      const ui = tableSceneFixture(state);
      try {
        const choices = [...ui.scene.model!.leaves];
        for (const choice of choices) {
          ui.load(state); ui.submitted.length = 0;
          reach(ui, choice);
          x.rules.apply(structuredClone(state), choice.id);
          if (choice.ability) coveredAbilities.add(skillId(choice.ability));
          if (general === 'standard.caocao' && choice.cardIds.length === 2) coveredAbilities.add('standard.zhangba');
        }
        if (mode === 'judgeReplace') {
          // Both the small equipment row and central replacement card must work.
          const equipment = Object.values(observe(state, 0).self.equip).filter(Boolean).map(card => card!.id);
          for (const choice of choices.filter(choice => choice.cardIds.some(id => equipment.includes(id)))) {
            ui.load(state); ui.submitted.length = 0; ui.clickEquipment(0, choice.cardIds[0]);
            ui.node('play-action').click(); assert.equal(ui.submitted[0].id, choice.id);
          }
        }
      } finally { ui.dispose(); }
    }
  });
}

for (const [general, lord, ability] of [['standard.diaochan', 'wind.zhangjiao', 'wind.huangtian.gift'],
  ['standard.sunquan', 'mountain.sunce', 'mountain.zhiba.offer']] as const) {
  test(`${ability}：其他角色获得的主公技入口也能显示并选牌、选主公`, () => {
    for (const cards of ['standard', 'junzheng'] as const) {
      const { x, state } = richScene(general, 5, cards);
      const definition = allContent.general(lord);
      Object.assign(state.players[1], { general: lord, group: definition.group, sex: definition.sex });
      state.mode.roles = ['loyalist', 'lord', 'rebel', 'rebel', 'renegade'];
      const current = preparePlayScenario(state, 0, x.runtime);
      const ui = tableSceneFixture(current);
      try {
        const choices = ui.scene.model!.leaves.filter(choice => choice.ability === ability);
        assert.ok(choices.length);
        for (const choice of choices) {
          ui.load(current); ui.submitted.length = 0; reach(ui, choice);
          x.rules.apply(structuredClone(current), choice.id);
          coveredAbilities.add(ability);
        }
      } finally { ui.dispose(); }
    }
  });
}

test('缔盟零费用交换两人的手牌时，可先点较高座位再点较低座位并取消重选', () => {
  const x = mountainScene(5, 'junzheng', true);
  x.general(0, 'forest.lusu');
  x.f.hand(0, 'tao');
  for (let seat = 1; seat < 5; seat++) { x.f.hand(seat, 'sha'); x.f.hand(seat, 'shan'); }
  let state = x.start();
  const ui = tableSceneFixture(state);
  try {
    ui.clickSkill('forest.dimeng'); state = x.rules.apply(state, ui.submitted.pop()!.id); ui.load(state);
    ui.node('play-action').click(); state = x.rules.apply(state, ui.submitted.pop()!.id); ui.load(state);
    assert.equal(decision(state)?.kind, 'skillTarget');
    ui.clickTarget(4); assert.deepEqual(ui.scene.model!.targets, [4]);
    ui.clickTarget(1); assert.deepEqual(ui.scene.model!.targets, [4, 1]);
    ui.clickTarget(4); assert.deepEqual(ui.scene.model!.targets, [1]);
    ui.clickTarget(3); assert.deepEqual(ui.scene.model!.targets, [1, 3]);
    const first = [...state.players[1].hand], second = [...state.players[3].hand];
    ui.node('play-action').click(); state = x.rules.apply(state, ui.submitted.pop()!.id);
    assert.deepEqual(state.players[1].hand, second);
    assert.deepEqual(state.players[3].hand, first);
  } finally { ui.dispose(); }
});

test('万箭齐发的护驾和南蛮入侵的激将都能点铭牌并由同势力角色完成响应', () => {
  for (const [general, ally, mode, ability, cardName] of [
    ['standard.caocao', 'standard.simayi', 'wanjian', 'standard.hujia', 'shan'],
    ['standard.liubei', 'standard.guanyu', 'nanman', 'standard.jijiang', 'sha'],
  ] as const) {
    const { x, state } = richScene(general, 5, 'junzheng');
    const definition = allContent.general(ally);
    Object.assign(state.players[1], { general: ally, group: definition.group, sex: definition.sex });
    const card = state.deck.splice(state.deck.findIndex(id => state.cards[id].name === cardName), 1)[0];
    state.players[1].hand.push(card);
    state.resolution = resolutionStack.initial();
    promptResponse(state, { mode, actor: 0, source: 4 }); x.advance(state);
    const ui = tableSceneFixture(state);
    let current = state;
    try {
      assert.ok(ui.scene.model!.leaves.some(choice => choice.ability === ability), `${ability} 在 ${mode} 响应时必须提供入口`);
      ui.clickSkill(ability);
      current = x.rules.apply(current, ui.submitted.pop()!.id);
      assert.equal(decision(current)?.kind, 'proxyResponse');
      assert.equal(decision(current)?.actor, 1);
    } finally { ui.dispose(); }
    const allyUI = tableSceneFixture(current);
    try {
      allyUI.clickCard(card); allyUI.node('play-action').click();
      current = x.rules.apply(current, allyUI.submitted.pop()!.id);
      assert.ok(current.discard.includes(card));
      assert.equal(current.players[0].hp, state.players[0].hp, '代理响应成功，主公没有受到锦囊伤害');
    } finally { allyUI.dispose(); }
  }
});

for (const kind of ['phaseStartChoice', 'phaseEndChoice', 'phaseDrawChoice', 'triggerConfirm',
  'skillJudgementChoice', 'attackRedirect', 'pindian', 'skillFollowup', 'skillCost', 'skillTarget'] as const) {
  test(`${kind}：通用技能选择阶段的全部合法选项通过真实场景和 HUD 回调可达`, () => {
    const general = { phaseStartChoice: 'standard.zhenji', phaseEndChoice: 'wind.caoren',
      phaseDrawChoice: 'standard.zhangliao', triggerConfirm: 'standard.guojia',
      skillJudgementChoice: 'standard.caocao', attackRedirect: 'standard.daqiao',
      pindian: 'fire.taishici', skillFollowup: 'standard.zhouyu',
      skillCost: 'standard.sunshangxiang', skillTarget: 'standard.liubei' }[kind];
    for (const cards of ['standard', 'junzheng'] as const) {
      const { x, state } = richScene(general, 5, cards);
      state.resolution = resolutionStack.initial();
      let current = state;
      if (kind === 'phaseStartChoice') resolutionStack.enqueue(current, { kind: 'phaseStartOffer', ability: 'standard.luoshen', owner: 0 });
      if (kind === 'phaseEndChoice') resolutionStack.enqueue(current, { kind: 'phaseEndOffer', ability: 'wind.jushou', owner: 0 });
      if (kind === 'phaseDrawChoice') resolutionStack.enqueue(current, { kind: 'phaseDraw' });
      if (kind === 'triggerConfirm') damage(current, 0, 1, 1);
      if (kind === 'pindian') new PindianFlow(x.runtime).begin(current, 0, 1, 'fire.tianyi');
      if (kind === 'attackRedirect') beginAttackUse(current, 1, { name: 'sha', suit: null, virtual: true },
        [0], x.runtime, { ignoreDistance: true });
      if (kind === 'skillJudgementChoice') {
        const definition = allContent.general('standard.xiahoudun');
        Object.assign(current.players[1], { general: definition.id, group: definition.group, sex: definition.sex });
        const index = current.deck.findIndex(id => current.cards[id].suit === 'spade');
        current.deck.push(current.deck.splice(index, 1)[0]);
        damage(current, 1, 0, 1);
      }
      if (['skillFollowup', 'skillCost', 'skillTarget'].includes(kind)) current = preparePlayScenario(current, 0, x.runtime);
      else x.advance(current);
      if (kind === 'skillJudgementChoice') current = x.choose(current, data => data.type === 'yes');
      if (kind === 'skillFollowup') current = x.choose(current, data => data.type === 'activeSkill' && data.ability === 'standard.fanjian' && data.targets[0] === 1);
      if (kind === 'skillCost') current = x.choose(current, data => data.type === 'beginSkill' && data.ability === 'standard.jieyin');
      if (kind === 'skillTarget') {
        current = x.choose(current, data => data.type === 'beginSkill' && data.ability === 'standard.rende');
        current = x.choose(current, data => data.type === 'toggle');
        current = x.choose(current, data => data.type === 'confirm');
      }
      assert.equal(decision(current)?.kind, kind);
      const ui = tableSceneFixture(current);
      try {
        const choices = [...ui.scene.model!.leaves];
        for (const choice of choices) {
          ui.load(current); ui.submitted.length = 0; reach(ui, choice);
          x.rules.apply(structuredClone(current), choice.id);
        }
      } finally { ui.dispose(); }
    }
  });
}

for (const general of allContent.generals()) {
  test(`${general.label}：两种牌堆和两／五人局的主动技能、转化牌可通过场景回调操作`, () => {
    for (const count of [2, 5]) for (const cards of ['standard', 'junzheng'] as const) {
      const { x, state } = richScene(general.id, count, cards);
      const ui = tableSceneFixture(state);
      try {
        const choices = new Map<string, ActionChoice>();
        const equip = Object.values(observe(state, 0).self.equip).filter(Boolean).map(card => card!.id);
        for (const choice of ui.scene.model!.leaves.filter(choice => choice.ability)) {
          // Cover every distinct cost/target shape, including hand, equipment,
          // public piles, multiple costs, no-cost skills and recast alternatives.
          const key = [choice.ability, choice.actionType, choice.cardIds.length,
            choice.cardIds.some(id => equip.includes(id)), choice.targetIds.length].join(':');
          choices.set(key, choice);
        }
        for (const choice of choices.values()) {
          ui.load(state); ui.submitted.length = 0;
          reach(ui, choice);
          x.rules.apply(structuredClone(state), choice.id);
          coveredAbilities.add(skillId(choice.ability!));
          ui.load(state);
          if (choice.cardIds.length || choice.targetIds.length) {
            ui.clickSkill(choice.ability!);
            ui.node('cancel-action').click();
            assert.equal(ui.scene.model!.focus, null);
            assert.deepEqual(ui.scene.model!.cards, []);
            assert.deepEqual(ui.scene.model!.targets, []);
          }
        }
      } finally { ui.dispose(); }
    }
  });
}

for (const general of ['standard.sunquan', 'forest.lusu']) {
  test(`${general}：画像装备条和中央装备牌都提交逐张费用，不会确认漏算装备`, () => {
    const { x, state } = richScene(general, 5, 'junzheng');
    const ability = general === 'standard.sunquan' ? 'standard.zhiheng' : 'forest.dimeng';
    const ui = tableSceneFixture(state);
    try {
      ui.clickSkill(ability);
      let current = x.rules.apply(state, ui.submitted.pop()!.id);
      ui.load(current);
      const equipment = current.players[0].equip.armor!;
      ui.clickEquipment(0, equipment);
      assert.equal(ui.submitted.length, 1, '点击装备条必须提交 toggle，而非只在界面选中');
      current = x.rules.apply(current, ui.submitted.pop()!.id);
      ui.load(current);
      assert.deepEqual(ui.scene.model!.selectedByRule, [equipment]);
      assert.equal(ui.node('play-action').disabled, false);
      ui.clickCard(equipment);
      current = x.rules.apply(current, ui.submitted.pop()!.id);
      ui.load(current);
      assert.deepEqual(ui.scene.model!.selectedByRule, []);
    } finally { ui.dispose(); }
  });
}

test('主动／转化技能覆盖清单防止以后新增技能漏测', () => {
  const expected = allContent.skills().filter(skill => skill.active || skill.transformation || skill.transformations).map(skill => skill.id);
  assert.deepEqual([...coveredAbilities].sort(), expected.sort());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cardType, equipSlot, NAMES, WEAPON_RANGE } from '../catalog.ts';
import { StandardRuleset } from '../engine.ts';
import { standardContent, standardPack } from '../src/content/standard/content.ts';
import { ContentRegistry, type ContentPack } from '../src/rules/content-registry.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { discardOwned, draw } from '../src/rules/operations/cards.ts';
import { cardMovement } from '../src/rules/operations/card-movement-service.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { legalActions } from '../src/core/decision-manager.ts';
import type { ActionMap } from '../src/domain/state.ts';
import { fixture } from './support/scenario-builder.ts';

test('标准牌元数据、兼容目录和注册表同源，且内容引用受校验', () => {
  assert.equal(standardContent.deck.length, 108);
  for (const definition of standardContent.cards()) {
    assert.equal(NAMES[definition.id], definition.label);
    assert.equal(cardType(definition.id), definition.kind);
    if (definition.slot) assert.equal(equipSlot(definition.id), definition.slot);
    if (definition.range) assert.equal(WEAPON_RANGE[definition.id], definition.range);
    for (const ability of definition.abilities ?? []) assert.equal(standardContent.requireSkill(ability).id, ability);
  }
  const bad: ContentPack = { id: 'bad', cards: [], deck: [], generals: [{ id: 'missing', label: '缺少技能', abilities: ['unknown'] }], skills: [] };
  assert.throws(() => new ContentRegistry([standardPack, bad]), /未知能力定义/);
  assert.throws(() => new ContentRegistry([standardPack, standardPack]), /重复/);
});

test('装备能力由当前牌区解析，卸装立即影响查询、转化与触发拥有关系', () => {
  const f = fixture();
  const zhuge = f.equip(0, 'zhuge', 'weapon');
  const runtime = new ContentRuntime(standardContent);
  assert.ok(runtime.abilities.has(f.state, 0, 'standard.zhuge'));
  assert.deepEqual(runtime.abilities.instances(f.state, 0).find(item => item.definition.id === 'standard.zhuge')?.source,
    { kind: 'equipment', slot: 'weapon', cardId: zhuge });
  assert.equal(runtime.queries.shaLimit(f.state, 0), Infinity);
  discardOwned(f.state, 0, zhuge);
  assert.equal(runtime.abilities.has(f.state, 0, 'standard.zhuge'), false);
  assert.equal(runtime.queries.shaLimit(f.state, 0), 1);

  const zhangba = f.equip(0, 'zhangba', 'weapon');
  f.hand(0, 'tao'); f.hand(0, 'shan');
  assert.equal(runtime.transforms.candidates(f.state, 0, 'sha').filter(candidate => candidate.virtual).length, 1);
  discardOwned(f.state, 0, zhangba);
  assert.equal(runtime.transforms.candidates(f.state, 0, 'sha').filter(candidate => candidate.virtual).length, 0);
});

for (const count of [5, 8]) {
  test(`${count} 人身份局：武将授予的修正与触发经同一内容实例进入现有流程`, () => {
    const extra: ContentPack = {
      id: 'test-generals', cards: [], deck: [],
      generals: [{ id: 'test.scout', label: '测试武将', abilities: ['test.longRange', 'test.attackDraw'] }],
      skills: [
        { id: 'test.longRange', modifier: { attackRange: () => 3 } },
        { id: 'test.attackDraw', trigger: {
          id: 'test.attackDraw', grantedBy: 'test.attackDraw', event: 'attackTargeted', priority: 5,
          owners: (_state, event) => [event.data.source],
          eligible: (_state, event, owner) => event.data.source === owner,
          execute: (state, _event, owner) => draw(state, owner, 1),
        } },
      ],
    };
    const content = new ContentRegistry([standardPack, extra]);
    const runtime = new ContentRuntime(content);
    const rules = new StandardRuleset(standardModes, undefined, content);
    const f = fixture(count, { mode: 'identity' });
    const sha = f.hand(0, 'sha');
    f.state.players[0].general = 'test.scout';
    assert.equal(runtime.queries.attackRange(f.state, 0), 3);
    f.state.active = 0;
    f.state.resolution = resolutionStack.initial();
    resolutionStack.enqueue(f.state, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
    createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
    const attack = legalActions(f.state).find(option => {
      const data = option.data as ActionMap['play'] | undefined;
      return data?.type === 'play' && data.cid === sha && data.targets[0] === 2;
    });
    assert.ok(attack, '距离为 2 的角色应成为合法目标');
    const state = rules.apply(f.state, attack.id);
    assert.ok(state.events.some(event => event.kind === 'triggerInvoked' && event.data.definition === 'test.attackDraw'));
    assert.equal(state.players[0].hand.length, 1);
    assert.equal(state.resolution.stack.at(-1)?.prompt?.actor, 2);
    assert.equal(rules.observe(state, 1).self.general, undefined);
    assert.equal(rules.observe(state, 0).self.general, 'test.scout');
  });
}

for (const [ability, costName] of [['test.shanAsSha', 'shan'], ['test.freeSha', null]] as const) {
  test(`注册转化 ${ability} 在主动出牌中使用实际候选与费用`, () => {
    const extra: ContentPack = {
      id: 'test-transform', cards: [], deck: [],
      generals: [{ id: 'test.transformer', label: '转化测试', abilities: [ability] }],
      skills: [{ id: ability, label: '试用转化', transformation: {
        id: ability, grantedBy: ability, produces: 'sha',
        costs: state => costName ? state.players[0].hand
          .filter(id => state.cards[id].name === costName).map(id => [id]) : [[]],
      } }],
    };
    const content = new ContentRegistry([standardPack, extra]);
    const runtime = new ContentRuntime(content);
    const rules = new StandardRuleset(standardModes, undefined, content);
    const f = fixture(5, { mode: 'identity' });
    f.state.players[0].general = 'test.transformer';
    const cost = costName ? f.hand(0, costName) : null;
    f.state.active = 0;
    f.state.resolution = resolutionStack.initial();
    resolutionStack.enqueue(f.state, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
    createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
    const option = legalActions(f.state).find(choice => {
      const data = choice.data as ActionMap['play'] | undefined;
      return data?.type === 'virtualSha' && data.transformation === ability && data.targets[0] === 1;
    });
    assert.ok(option);
    const state = rules.apply(f.state, option.id);
    assert.equal(state.shaUsed, 1);
    if (cost !== null) assert.ok(state.discard.includes(cost));
    assert.ok(state.events.some(event => event.kind === 'transformationUsed' && event.data.ability === ability));
    const timing = state.events.find(event => event.kind === 'attackTargeted');
    assert.ok(timing?.kind === 'attackTargeted');
    assert.equal(typeof timing.data.sha !== 'number' && 'virtual' in timing.data.sha ? timing.data.sha.virtual : false, true);
    assert.equal(state.resolution.stack.at(-1)?.prompt?.actor, 1);
  });
}

for (const [count, id, effect] of [[5, 'test.remedy', 'recover'], [8, 'test.draw', 'drawTwo']] as const) {
  test(`${count} 人局：新增牌 ${id} 只注册内容即可复用现有效果与中文展示`, () => {
    const extension: ContentPack = {
      id: 'test-card-pack', skills: [], generals: [],
      cards: [{ id, label: effect === 'recover' ? '试用药' : '试用摸牌', kind: effect === 'recover' ? 'basic' : 'trick',
        play: { targeting: 'none', ...(effect === 'recover' ? { availability: 'wounded' as const } : { scope: 'self' as const }) },
        effect }],
      deck: [{ name: id, suit: 'heart', rank: 1 }],
    };
    const content = new ContentRegistry([standardPack, extension]);
    const runtime = new ContentRuntime(content);
    const rules = new StandardRuleset(standardModes, undefined, content);
    const state = rules.create({ mode: 'identity', seed: 7,
      players: Array.from({ length: count }, (_, index) => ({ label: `角色${index + 1}`, sex: 'male' as const })) });
    const customId = 109;
    assert.equal(state.cards[customId].name, id);
    assert.equal(state.cards[customId].label, extension.cards[0].label);
    for (const player of state.players) for (const cid of [...player.hand]) {
      if (cid !== customId) cardMovement.move(state, [cid], { kind: 'deck' });
    }
    if (!state.players[0].hand.includes(customId)) cardMovement.move(state, [customId], { kind: 'hand', owner: 0 });
    state.players[0].hp = 3;
    state.active = 0;
    state.resolution = resolutionStack.initial();
    resolutionStack.enqueue(state, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
    createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(state);
    const option = legalActions(state).find(choice => {
      const data = choice.data as ActionMap['play'] | undefined;
      return data?.type === 'play' && data.cid === customId;
    });
    assert.ok(option);
    const result = rules.apply(state, option.id);
    assert.ok(result.discard.includes(customId));
    if (effect === 'recover') assert.equal(result.players[0].hp, 4);
    else assert.equal(result.players[0].hand.length, 2);
    assert.match(rules.observe(result, 1).log.join('\n'), effect === 'recover' ? /试用药/ : /试用摸牌/);
  });
}

test('新增响应类锦囊复用范围目标与响应流程，并展示自己的牌名', () => {
  const id = 'test.assault';
  const content = new ContentRegistry([standardPack, {
    id: 'test-response-card', skills: [], generals: [],
    cards: [{ id, label: '试用冲锋', kind: 'trick', play: { targeting: 'none', scope: 'others' }, effect: 'requireSha' }],
    deck: [{ name: id, suit: 'club', rank: 1 }],
  }]);
  const runtime = new ContentRuntime(content);
  const rules = new StandardRuleset(standardModes, undefined, content);
  const state = rules.create({ mode: 'identity', seed: 7,
    players: Array.from({ length: 5 }, (_, index) => ({ label: `角色${index + 1}`, sex: 'male' as const })) });
  for (const player of state.players) for (const cid of [...player.hand]) {
    if (cid !== 109) cardMovement.move(state, [cid], { kind: 'deck' });
  }
  if (!state.players[0].hand.includes(109)) cardMovement.move(state, [109], { kind: 'hand', owner: 0 });
  state.active = 0;
  state.resolution = resolutionStack.initial();
  resolutionStack.enqueue(state, { kind: 'phasePlay' }, { kind: 'phaseDiscard' }, { kind: 'phaseEnd' });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(state);
  const cardUse = legalActions(state).find(choice => (choice.data as { cid?: number } | undefined)?.cid === 109);
  assert.ok(cardUse);
  let current = rules.apply(state, cardUse.id);
  for (let actor = 1; actor < 5; actor++) {
    const prompt = current.resolution.stack.at(-1)?.prompt;
    assert.equal(prompt?.actor, actor);
    assert.match(prompt.title, /试用冲锋/);
    const pass = legalActions(current).find(choice => (choice.data as { type?: string } | undefined)?.type === 'pass');
    assert.ok(pass);
    current = rules.apply(current, pass.id);
  }
  assert.ok(current.players.slice(1).every(player => player.hp === player.maxHp - 1));
});

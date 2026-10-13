import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { StandardRuleset, type GameState } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { allContent } from '../src/app/game-content.ts';
import type { ScoredAction } from '../src/policies/evaluation-registry.ts';
import { fixture } from './support/scenario-builder.ts';
import { draw } from '../src/rules/operations/cards.ts';
import { eventSounds } from '../src/web/sound-cues.ts';
import type { AssetManifest } from '../src/web/assets.ts';
import { ChineseView } from '../chinese-view.ts';
import { canRetryLordRequest } from '../src/policies/content/standard/lord.ts';
import { preparePlayScenario } from '../src/app/standard-game.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { mountainScene } from './support/mountain-scenario.ts';
import { beginDying } from '../src/rules/flows/dying-flow.ts';

const rules = new StandardRuleset();
const policy = new StrategicPolicy();
function select(state: GameState, predicate: (action: ScoredAction) => boolean) {
  const option = rules.legalActions(state).find(choice => predicate(choice.data as ScoredAction));
  assert.ok(option, JSON.stringify(rules.decision(state)));
  return rules.apply(state, option.id);
}
function chosen(state: GameState, strategy = policy) {
  const decision = rules.decision(state)!;
  const id = strategy.choose(rules.observe(state, decision.actor), decision);
  return { id, action: rules.legalActions(state).find(choice => choice.id === id)!.data as ScoredAction };
}
function identity(lord = 'standard.caocao', supporters = [1]) {
  const f = fixture(5, { mode: 'identity', roles: ['lord', 'loyalist', 'rebel', 'rebel', 'renegade'] });
  const g = allContent.general(lord);
  Object.assign(f.state.players[0], { general: lord, group: g.group });
  f.state.players.forEach((p, i) => { if (i) p.group = supporters.includes(i) ? g.group : 'qun'; });
  return f;
}
function attack(f: ReturnType<typeof identity>) {
  const sha = f.hand(4, 'sha');
  return select(f.start(4), a => a.type === 'play' && a.cid === sha && a.targets?.[0] === 0);
}

test('AI 主公会先护驾，友方 AI 代闪；发动记录和技能语音均在请求时产生一次', () => {
  const f = identity();
  const ownShan = f.hand(0, 'shan'), allyShan = f.hand(1, 'shan');
  let state = attack(f);
  assert.equal(chosen(state).action.type, 'proxy');
  state = rules.apply(state, chosen(state).id);
  assert.equal(rules.decision(state)?.kind, 'proxyResponse');
  const events = rules.observe(state, 0).events.filter(event => event.kind === 'skillActivated' && event.data.ability === 'standard.hujia');
  assert.equal(events.length, 1);
  assert.ok(rules.observe(state, 0).log.some(line => line.includes('发动【护驾】')));
  const manifest = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8')) as AssetManifest;
  assert.ok(eventSounds(events[0], rules.observe(state, 0), manifest).length > 0);
  assert.equal(chosen(state).action.type, 'respond');
  const hp = state.players[0].hp;
  state = rules.apply(state, chosen(state).id);
  assert.equal(state.players[0].hp, hp);
  assert.ok(state.discard.includes(allyShan));
  assert.ok(state.players[0].hand.includes(ownShan));
});

for (const suit of ['heart', 'spade'] as const) {
  test(`护驾的魏将八卦${suit === 'heart' ? '成功代闪' : '失败后仍能打自己的闪'}，AI 自动完成且判定不重复`, () => {
    const f = identity();
    f.equip(1, 'bagua', 'armor');
    const shan = suit === 'spade' ? f.hand(1, 'shan') : undefined;
    f.top('sha', suit);
    let state = attack(f);
    const hp = state.players[0].hp;
    state = rules.apply(state, chosen(state).id);
    assert.equal(chosen(state).action.type, 'bagua');
    state = rules.apply(state, chosen(state).id);
    if (suit === 'spade') {
      assert.equal(rules.decision(state)?.actor, 1);
      assert.ok(!rules.legalActions(state).some(option => (option.data as ScoredAction).type === 'bagua'));
      state = JSON.parse(JSON.stringify(state));
      assert.equal(chosen(state).action.type, 'respond');
      state = rules.apply(state, chosen(state).id);
      assert.ok(state.discard.includes(shan!));
    }
    assert.equal(state.players[0].hp, hp);
    assert.equal(state.events.filter(event => event.kind === 'judged' && event.data.reason === 'bagua').length, 1);
  });
}

test('八卦失败且没有闪时继续询问下一位魏将，不提前放弃护驾', () => {
  const f = identity('standard.caocao', [1, 2]);
  f.equip(1, 'bagua', 'armor'); f.hand(2, 'shan'); f.top('sha', 'spade');
  let state = attack(f);
  state = select(state, a => a.type === 'proxy');
  state = select(state, a => a.type === 'bagua');
  assert.equal(rules.decision(state)?.actor, 2);
  state = select(state, a => a.type === 'respond');
  assert.equal(state.players[0].hp, f.state.players[0].hp);
});

test('最后一位魏将的八卦失败后仍保留自己的闪作为后备', () => {
  const f = identity('standard.caocao', [4]);
  f.equip(4, 'bagua', 'armor'); const shan = f.hand(4, 'shan'); f.top('sha', 'spade');
  let state = attack(f);
  state = select(state, a => a.type === 'proxy');
  state = select(state, a => a.type === 'bagua');
  assert.equal(rules.decision(state)?.actor, 4);
  state = select(state, a => a.type === 'respond');
  assert.ok(state.discard.includes(shan));
});

test('敌方魏将可以拒绝护驾，主公请求失败后使用自己的闪且不在同一窗口重复请求', () => {
  const f = identity('standard.caocao', [2]);
  const ownShan = f.hand(0, 'shan'), enemyShan = f.hand(2, 'shan');
  let state = attack(f);
  state = rules.apply(state, chosen(state).id);
  assert.equal(chosen(state).action.type, 'pass');
  state = rules.apply(state, chosen(state).id);
  assert.equal(rules.decision(state)?.kind, 'respond');
  assert.equal(chosen(state).action.type, 'respond');
  state = rules.apply(state, chosen(state).id);
  assert.ok(state.discard.includes(ownShan));
  assert.ok(state.players[2].hand.includes(enemyShan));
});

function proactive() {
  const f = identity('standard.liubei');
  f.hand(1, 'sha');
  f.state.mode.knownTo[4] = [0, 1, 4];
  return { f, state: f.start() };
}

test('AI 刘备无杀时主动激将，友方供杀后使用一次杀，伤害仍由刘备造成', () => {
  let { state } = proactive();
  const hp = state.players[4].hp;
  assert.equal(chosen(state).action.type, 'proxySha');
  state = rules.apply(state, chosen(state).id);
  assert.equal(chosen(state).action.type, 'respond');
  state = rules.apply(state, chosen(state).id);
  state = select(state, a => a.type === 'pass');
  assert.equal(state.shaUsed, 1);
  assert.equal(state.players[4].hp, hp - 1);
  assert.equal(state.events.filter(e => e.kind === 'skillActivated' && e.data.ability === 'standard.jijiang').length, 1);
  assert.ok(state.events.some(e => e.kind === 'damaged' && e.data.source === 0));
});

test('激将被全部拒绝后 AI 不空喊循环，失败信息可序列化且仅向请求者投影', () => {
  let { state } = proactive();
  state = rules.apply(state, chosen(state).id);
  state = select(state, a => a.type === 'pass');
  assert.equal(state.shaUsed, 0);
  assert.equal(chosen(state).action.type, 'endPlay');
  const obs = rules.observe(state, 0);
  assert.equal(obs.failedProxyRequests?.length, 1);
  assert.ok(new ChineseView().stateForDecision(obs, rules.decision(state)!).includes('激将】请求无人应答'));
  assert.deepEqual(Object.keys(obs.failedProxyRequests![0].supporters[0]).sort(), ['equipmentIds', 'handCount', 'id']);
  assert.equal(rules.observe(state, 1).failedProxyRequests, undefined);
  state = JSON.parse(JSON.stringify(state));
  assert.equal(chosen(state, new StrategicPolicy()).action.type, 'endPlay');
  const hiddenSwap = structuredClone(state);
  const hidden = hiddenSwap.players[1].hand[0];
  const replacement = hiddenSwap.deck.find(id => hiddenSwap.cards[id].name === 'shan')!;
  hiddenSwap.deck.splice(hiddenSwap.deck.indexOf(replacement), 1);
  hiddenSwap.players[1].hand = [replacement]; hiddenSwap.deck.push(hidden);
  assert.equal(chosen(hiddenSwap).action.type, 'endPlay', '相同张数的暗牌变化不能被策略窥探');
  const nextTurn = structuredClone(state); nextTurn.turn++;
  assert.equal(chosen(nextTurn).action.type, 'proxySha', '下一回合可重新请求');
  draw(state, 1, 1);
  assert.equal(chosen(state).action.type, 'proxySha', '队友公开资源变化后可以重新请求');
  state = rules.apply(state, chosen(state).id);
  state = rules.apply(state, chosen(state).id);
  assert.equal(rules.observe(state, 0).failedProxyRequests, undefined, '成功供牌清除旧失败记录，不能再误锁后续请求');
});

test('护驾／激将没有同势力存活角色或非主公时不提供发动候选', () => {
  for (const lord of ['standard.caocao', 'standard.liubei']) {
    const f = identity(lord, []);
    assert.ok(!rules.legalActions(f.start()).some(o => (o.data as ScoredAction).type === 'proxySha'));
    assert.ok(!rules.legalActions(attack(f)).some(o => (o.data as ScoredAction).type === 'proxy'));
    const other = identity(lord);
    other.state.mode.roles = ['loyalist', 'lord', 'rebel', 'rebel', 'renegade'];
    assert.ok(!rules.legalActions(other.start()).some(o => (o.data as ScoredAction).type === 'proxySha'));
    assert.ok(!rules.legalActions(attack(other)).some(o => (o.data as ScoredAction).type === 'proxy'));
  }
});

test('八卦代闪成功触发代打者的闪响应技能，结算后才恢复主公的原响应', () => {
  const f = identity(); f.equip(1, 'bagua', 'armor'); f.top('sha', 'heart');
  f.state.players[1].gainedAbilities = ['wind.leiji'];
  const windRules = new StandardRuleset(undefined, undefined, allContent);
  const sha = f.hand(4, 'sha');
  let state = preparePlayScenario(f.state, 4, new ContentRuntime(allContent));
  state = windRules.apply(state, windRules.legalActions(state).find(o => {
    const a = o.data as ScoredAction; return a.cid === sha && a.targets?.[0] === 0;
  })!.id);
  state = windRules.apply(state, windRules.legalActions(state).find(o => (o.data as ScoredAction).type === 'proxy')!.id);
  state = windRules.apply(state, windRules.legalActions(state).find(o => (o.data as ScoredAction).type === 'bagua')!.id);
  assert.equal(windRules.decision(state)?.kind, 'contentChoice');
  assert.equal(windRules.decision(state)?.actor, 1);
  state = windRules.apply(state, windRules.legalActions(state).find(o => (o.data as ScoredAction).type === 'pass')!.id);
  assert.equal(state.players[0].hp, f.state.players[0].hp);
});

test('供应者响应费用按全部子牌计价，不把昂贵双牌代杀当成免费支援', () => {
  const f = identity('standard.liubei');
  const a = f.hand(1, 'tao'), b = f.hand(1, 'tao'); f.equip(1, 'zhangba', 'weapon');
  let state = select(f.start(), action => action.type === 'proxySha' && action.targets?.[0] === 4);
  const decision = rules.decision(state)!;
  const candidate = policy.rank(rules.observe(state, 1), decision).find(row =>
    (rules.legalActions(state).find(o => o.id === row.id)!.data as ScoredAction).ids?.length === 2)!;
  assert.ok(candidate.score < 4 - .25 * 8);
  assert.equal(chosen(state).action.type, 'pass');
  assert.ok(state.players[1].hand.includes(a) && state.players[1].hand.includes(b));
  assert.ok(canRetryLordRequest(rules.observe(state, 0), 'standard.jijiang', 'shu'));
});

for (const [lord, ally, ability] of [['forest.caopi', 'standard.xuzhu', 'forest.songwei.offer'],
  ['forest.dongzhuo', 'standard.diaochan', 'forest.baonue.offer'],
  ['wind.zhangjiao', 'standard.diaochan', 'wind.huangtian.gift'],
  ['mountain.sunce', 'standard.luxun', 'mountain.zhiba.offer']] as const) {
  test(`${ability}：有收益时友方 AI 愿意支援主公，敌方 AI 不为主公发动`, () => {
    for (const friendly of [true, false]) {
      const x = mountainScene(5, 'standard', true);
      x.general(0, lord); x.general(1, ally);
      if (!friendly) x.f.state.mode.roles = ['lord', 'rebel', 'loyalist', 'rebel', 'renegade'];
      let state = x.f.state;
      if (ability === 'forest.songwei.offer') {
        const id = x.f.hand(1, 'sha', 'spade');
        state = x.tasks({ kind: 'openTriggers', signal: { kind: 'judgementApplied',
          data: { player: 1, reason: 'bagua', card: id } }, then: [] });
      } else if (ability === 'forest.baonue.offer') {
        state.players[0].hp--; x.f.top('sha', 'spade');
        state = x.tasks({ kind: 'openTriggers', signal: { kind: 'damageTaken',
          data: { source: 1, target: 2, amount: 1, card: null } }, then: [] });
      } else if (ability === 'wind.huangtian.gift') {
        x.f.hand(1, 'shan'); x.f.hand(1, 'shan'); state = x.start(1);
      } else {
        x.f.hand(0, 'shan');
        const low = x.f.hand(1, 'shandian'); x.f.state.cards[low].rank = 1;
        for (let i = 0; i < 4; i++) x.f.hand(1, 'wuxie');
        state = x.start(1);
      }
      const d = x.rules.decision(state)!;
      assert.equal(d.actor, 1);
      const selected = x.rules.legalActions(state).find(o => o.id === policy.choose(x.rules.observe(state, 1), d))!.data as ScoredAction;
      if (d.kind === 'triggerConfirm') assert.equal(selected.type, friendly ? 'yes' : 'no');
      else assert.equal(selected.ability === ability, friendly);
      x.rules.apply(state, policy.choose(x.rules.observe(state, 1), d));
    }
  });
}

test('救援、血裔和若愚自动生效；若愚获得的激将也由 AI 正常使用', () => {
  const healing = mountainScene(5, 'standard', true);
  healing.general(0, 'standard.sunquan'); healing.general(1, 'standard.zhouyu');
  healing.f.hand(1, 'tao'); healing.f.state.players[0].hp = 0;
  beginDying(healing.f.state, 0); healing.advance(healing.f.state);
  const response = healing.rules.decision(healing.f.state)!;
  const saved = healing.rules.apply(healing.f.state, policy.choose(healing.rules.observe(healing.f.state, 1), response));
  assert.equal(saved.players[0].hp, 2);

  const limit = mountainScene(5, 'standard', true);
  limit.general(0, 'fire.yuanshao'); limit.f.state.players[1].group = 'qun'; limit.f.state.players[2].group = 'qun';
  limit.f.state.players[3].group = 'wei'; limit.f.state.players[4].group = 'wei';
  assert.equal(limit.runtime.queries.handLimit(limit.f.state, 0), limit.f.state.players[0].hp + 4);
  limit.f.state.players[2].alive = false;
  assert.equal(limit.runtime.queries.handLimit(limit.f.state, 0), limit.f.state.players[0].hp + 2);

  const awakening = mountainScene(5, 'standard', true);
  awakening.general(0, 'mountain.liushan'); awakening.general(1, 'standard.guanyu');
  awakening.f.state.players[0].hp = 1; awakening.f.hand(1, 'sha');
  awakening.f.state.mode.knownTo[4] = [0, 1, 4];
  let state = awakening.tasks({ kind: 'phaseStartOffer', owner: 0, ability: 'mountain.ruoyu' });
  assert.ok(state.players[0].gainedAbilities?.includes('standard.jijiang'));
  assert.ok(state.players[0].skillFlags?.['mountain.ruoyu.awakened']);
  state = preparePlayScenario(state, 0, awakening.runtime);
  const d = awakening.rules.decision(state)!;
  const selected = awakening.rules.legalActions(state).find(o => o.id === policy.choose(awakening.rules.observe(state, 0), d))!.data as ScoredAction;
  assert.equal(selected.type, 'proxySha');
});

test('主公技检查清单包括所有九项注册技能', () => {
  assert.deepEqual(allContent.skills().filter(skill => skill.lordSkill).map(skill => skill.id).sort(),
    ['standard.hujia', 'standard.jijiang', 'standard.jiuyuan', 'wind.huangtian', 'fire.xueyi',
      'forest.songwei', 'forest.baonue', 'mountain.zhiba', 'mountain.ruoyu'].sort());
});

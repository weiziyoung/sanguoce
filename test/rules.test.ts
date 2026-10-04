import { debugLog } from '../src/presentation/event-formatter.ts';
import test from "node:test";
import assert from "node:assert/strict";
import { STANDARD_DECK } from "../catalog.ts";
import { GameEngine, apply, createGame, decision, legalActions, observe, preparePlayScenario } from "../engine.ts";
import { ChineseView } from "../chinese-view.ts";
import { RuleBasePolicy } from "../policy.ts";

import { fixture } from "./support/scenario-builder.ts";

function option(state: ReturnType<typeof createGame>, predicate: (data: { type: string; cid?: number; ids?: number[]; targets?: number[]; zone?: string; slot?: number }) => boolean): string {
  const found = legalActions(state).find(choice => predicate(choice.data!));
  assert.ok(found, "缺少预期合法动作");
  return found.id;
}
function zones(state: ReturnType<typeof createGame>): number[] {
  return [
    ...state.deck, ...state.discard, ...state.table,
    ...state.players.flatMap(p => [
      ...p.hand, ...Object.values(p.equip).filter((id): id is number => id !== null), ...p.judge,
    ]),
  ];
}

test("标准包 108 张全部入堆，观察值与中文模型请求没有对手手牌或内部牌名", () => {
  assert.equal(STANDARD_DECK.length, 108);
  const state = createGame({ seed: 10 });
  const seen = zones(state);
  assert.equal(seen.length, 108);
  assert.equal(new Set(seen).size, 108);
  const player = observe(state, 0);
  const hidden = state.players[1].hand.map(id => state.cards[id]);
  assert.equal(player.others[0].handCount, hidden.length);
  assert.ok(!("hand" in player.others[0]));
  const request = new ChineseView().choiceSet(player, decision(state)!).request();
  const content = JSON.stringify(request);
  assert.doesNotMatch(content, /\b(sha|shan|tao|guohe|wuxie)\b/);
  assert.ok(!content.includes(`"id":${hidden[0].id}`));
});

test("借刀杀人在 1v1 可指定出牌者，拒绝出杀时交出武器", () => {
  const f = fixture();
  f.hand(0, "jiedao");
  const weapon = f.equip(1, "zhuge", "weapon");
  let s = f.start();
  const use = option(s, data => data.type === "play" && data.targets?.[0] === 1 && data.targets?.[1] === 0);
  s = apply(s, use);
  assert.equal(decision(s)?.kind, "jiedao");
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].equip.weapon, null);
  assert.ok(s.players[0].hand.includes(weapon));
  assert.equal(new Set(zones(s)).size, 108);
});

test("借刀杀人迫使对手出杀时，出牌者仍可用闪响应", () => {
  const f = fixture();
  f.hand(0, "jiedao");
  f.hand(0, "shan");
  f.equip(1, "zhuge", "weapon");
  f.hand(1, "sha");
  let s = f.start();
  s = apply(s, option(s, data => data.type === "play" && data.targets?.[1] === 0));
  s = apply(s, option(s, data => data.type === "jiedaoSha"));
  assert.equal(decision(s)?.kind, "respond");
  assert.equal(decision(s)?.actor, 0);
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(s.players[0].hp, 4);
  assert.equal(s.cards[s.players[1].equip.weapon!].name, "zhuge");
});

test("两张无懈可击相互反制后，过河拆桥正常结算", () => {
  const f = fixture();
  f.hand(0, "guohe");
  f.hand(0, "wuxie");
  f.hand(1, "wuxie");
  const armor = f.equip(1, "bagua", "armor");
  let s = f.start();
  s = apply(s, option(s, data => data.type === "play" && data.targets?.[0] === 1));
  assert.equal(decision(s)?.kind, "nullify");
  s = apply(s, option(s, data => data.type === "nullify"));
  assert.equal(decision(s)?.actor, 0);
  s = apply(s, option(s, data => data.type === "nullify"));
  assert.equal(decision(s)?.kind, "zone");
  s = apply(s, option(s, data => data.cid === armor));
  assert.equal(s.players[1].equip.armor, null);
  assert.ok(s.discard.includes(armor));
});

test("五谷丰登亮出两张，双方依次各选一张，没有丢牌", () => {
  const f = fixture();
  f.hand(0, "wugu");
  let s = f.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.equal(decision(s)?.kind, "wugu");
  const first = (legalActions(s)[0].data as { cid: number }).cid;
  s = apply(s, option(s, data => data.type === "wugu"));
  assert.ok(s.players[0].hand.includes(first));
  while (decision(s)?.kind === "nullify") s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(decision(s)?.actor, 1);
  s = apply(s, option(s, data => data.type === "wugu"));
  assert.ok(!s.resolution.stack.some(frame => frame.kind === 'trick' && frame.data.pool.length));
  assert.equal(new Set(zones(s)).size, 108);
});

test("仁王盾使黑色杀无效；八卦阵红色判定视为闪", () => {
  const first = fixture();
  first.hand(0, "sha", "spade");
  first.equip(1, "renwang", "armor");
  let s = first.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.equal(s.players[1].hp, 4);
  assert.match(debugLog(s).join("；"), /仁王盾/);

  const second = fixture();
  second.hand(0, "sha", "club");
  second.equip(1, "bagua", "armor");
  second.top("tao", "heart");
  s = second.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.equal(decision(s)?.actor, 1);
  s = apply(s, option(s, data => data.type === "bagua"));
  assert.equal(s.players[1].hp, 4);
  assert.match(debugLog(s).join("；"), /视为打出【闪】/);
});

test("非法动作不改变规则状态", () => {
  const state = createGame({ seed: 5 });
  const before = structuredClone(state);
  assert.throws(() => apply(state, "不存在的选项"), /不合法/);
  assert.deepEqual(state, before);
});

test("乐不思蜀非红桃判定跳过出牌；闪电黑桃2至9造成三点伤害", () => {
  const lebu = fixture();
  const delay = lebu.take("lebu");
  lebu.state.players[1].judge.push(delay);
  lebu.top("sha", "spade", 7);
  let s = lebu.start();
  s = apply(s, option(s, data => data.type === "endPlay"));
  assert.match(debugLog(s).join("；"), /跳过出牌阶段/);
  assert.ok(s.discard.includes(delay));

  const lightning = fixture();
  const bolt = lightning.take("shandian");
  lightning.state.players[1].judge.push(bolt);
  lightning.top("sha", "spade", 7);
  s = lightning.start();
  s = apply(s, option(s, data => data.type === "endPlay"));
  assert.equal(s.players[1].hp, 1);
  assert.ok(s.discard.includes(bolt));
});

test("闪电判定未命中会转移到下家；无懈也能抵消判定效果", () => {
  const f = fixture();
  const bolt = f.take("shandian");
  f.state.players[1].judge.push(bolt);
  f.hand(0, "wuxie");
  f.top("sha", "heart");
  let s = f.start();
  s = apply(s, option(s, data => data.type === "endPlay"));
  assert.equal(decision(s)?.kind, "nullify");
  s = apply(s, option(s, data => data.type === "nullify"));
  assert.ok(s.players[0].judge.includes(bolt));
  assert.equal(s.players[1].hp, 4);
});

test("防御坐骑拉开距离，武器攻击范围恢复杀的合法性", () => {
  const f = fixture();
  const sha = f.hand(0, "sha");
  f.equip(1, "jueying", "plusHorse");
  let s = f.start();
  assert.ok(!legalActions(s).some(choice => (choice.data && "cid" in choice.data ? choice.data.cid : undefined) === sha));
  const weapon = f.equip(0, "qinglong", "weapon");
  s = preparePlayScenario(f.state, 0);
  assert.ok(legalActions(s).some(choice => (choice.data && "cid" in choice.data ? choice.data.cid : undefined) === sha));
  assert.equal(s.cards[weapon].name, "qinglong");
});

test("诸葛连弩允许连续出杀；青釭剑无视仁王盾", () => {
  const f = fixture();
  f.hand(0, "sha", "heart");
  const secondSha = f.hand(0, "sha", "club");
  f.equip(0, "zhuge", "weapon");
  let s = f.start();
  s = apply(s, option(s, data => data.type === "play" && data.cid !== secondSha));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.ok(legalActions(s).some(choice => (choice.data && "cid" in choice.data ? choice.data.cid : undefined) === secondSha));

  const g = fixture();
  g.hand(0, "sha", "spade");
  g.equip(0, "qinggang", "weapon");
  g.equip(1, "renwang", "armor");
  s = g.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].hp, 3);
});

test("青龙偃月刀可在杀被闪抵消后追击；贯石斧可弃两牌令杀命中", () => {
  const qinglong = fixture();
  qinglong.hand(0, "sha", "heart");
  qinglong.hand(0, "sha", "club");
  qinglong.hand(1, "shan");
  qinglong.equip(0, "qinglong", "weapon");
  let s = qinglong.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(decision(s)?.kind, "qinglong");
  s = apply(s, option(s, data => data.type === "qinglong"));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].hp, 3);

  const guanshi = fixture();
  guanshi.hand(0, "sha", "heart");
  guanshi.hand(0, "tao");
  guanshi.hand(0, "wuzhong");
  guanshi.hand(1, "shan");
  guanshi.equip(0, "guanshi", "weapon");
  s = guanshi.start();
  s = apply(s, option(s, data => data.type === "play" && data.cid !== undefined && s.cards[data.cid].name === "sha"));
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(decision(s)?.kind, "guanshi");
  s = apply(s, option(s, data => data.type === "guanshi"));
  assert.equal(s.players[1].hp, 3);
});

test("寒冰剑防止伤害并弃两张牌；麒麟弓弃坐骑后正常造成伤害", () => {
  const hanbing = fixture();
  hanbing.hand(0, "sha");
  hanbing.equip(0, "hanbing", "weapon");
  hanbing.hand(1, "tao");
  hanbing.equip(1, "bagua", "armor");
  let s = hanbing.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(decision(s)?.kind, "hanbing");
  s = apply(s, option(s, data => data.type === "yes"));
  s = apply(s, option(s, data => data.zone === "equip"));
  s = apply(s, option(s, data => data.zone === "hand"));
  assert.equal(s.players[1].hp, 4);
  assert.equal(s.players[1].hand.length, 0);
  assert.equal(s.players[1].equip.armor, null);

  const qilin = fixture();
  qilin.hand(0, "sha");
  qilin.equip(0, "qilin", "weapon");
  const mount = qilin.equip(1, "chitu", "minusHorse");
  s = qilin.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(decision(s)?.kind, "qilin");
  s = apply(s, option(s, data => data.cid === mount));
  assert.equal(s.players[1].hp, 3);
  assert.equal(s.players[1].equip.minusHorse, null);
});

test("雌雄双股剑需要异性目标；丈八蛇矛两张手牌可当杀", () => {
  const cixiong = fixture();
  cixiong.hand(0, "sha");
  cixiong.hand(1, "tao");
  cixiong.equip(0, "cixiong", "weapon");
  let s = cixiong.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.equal(decision(s)?.kind, "cixiong");
  s = apply(s, option(s, data => data.type === "yes"));
  assert.equal(decision(s)?.kind, "cixiongCost");
  s = apply(s, option(s, data => data.type === "discard"));
  assert.equal(s.players[1].hand.length, 0);

  const zhangba = fixture();
  zhangba.hand(0, "tao");
  zhangba.hand(0, "shan");
  zhangba.equip(0, "zhangba", "weapon");
  s = zhangba.start();
  s = apply(s, option(s, data => data.type === "virtualSha"));
  assert.equal(decision(s)?.kind, "respond");
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].hp, 3);
});

test("方天画戟最后一张杀可在多角色规则局面指定多个目标", () => {
  const f = fixture(3);
  f.hand(0, "sha");
  f.equip(0, "fangtian", "weapon");
  let s = f.start();
  const multi = legalActions(s).find(choice => (choice.data && "targets" in choice.data ? choice.data.targets : undefined)?.length === 2);
  assert.ok(multi);
  s = apply(s, multi.id);
  s = apply(s, option(s, data => data.type === "pass"));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].hp, 3);
  assert.equal(s.players[2].hp, 3);
});

test("决斗双方轮流出杀，南蛮入侵与万箭齐发分别要求杀和闪", () => {
  const duel = fixture();
  duel.hand(0, "juedou");
  duel.hand(0, "sha");
  duel.hand(1, "sha");
  let s = duel.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.equal(decision(s)?.actor, 1);
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(decision(s)?.actor, 0);
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(decision(s)?.actor, 1);
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].hp, 3);

  const nanman = fixture();
  nanman.hand(0, "nanman");
  s = nanman.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.match(decision(s)?.title ?? "", /【杀】/);
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[1].hp, 3);

  const arrows = fixture();
  arrows.hand(0, "wanjian");
  arrows.hand(1, "shan");
  s = arrows.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.match(decision(s)?.title ?? "", /【闪】/);
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(s.players[1].hp, 4);
});

test("电脑打出决斗时，玩家作为目标先出杀，随后双方轮流响应", () => {
  const f = fixture();
  const duel = f.hand(1, "juedou");
  f.hand(0, "sha");
  f.hand(1, "sha");
  let s = f.start(1);
  s = apply(s, option(s, data => data.type === "play" && data.cid === duel && data.targets?.[0] === 0));
  assert.equal(decision(s)?.actor, 0);
  assert.match(decision(s)?.title ?? "", /【杀】/);
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(decision(s)?.actor, 1);
  s = apply(s, option(s, data => data.type === "respond"));
  assert.equal(decision(s)?.actor, 0);
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[0].hp, 3);
});

test("无中生有摸两张，桃园结义同时治疗双方，濒死可连续用桃", () => {
  const f = fixture();
  f.hand(0, "wuzhong");
  f.hand(0, "taoyuan");
  f.state.players[0].hp = 3;
  f.state.players[1].hp = 2;
  let s = f.start();
  const before = s.players[0].hand.length;
  s = apply(s, option(s, data => data.type === "play" && data.cid !== undefined && s.cards[data.cid].name === "wuzhong"));
  assert.equal(s.players[0].hand.length, before + 1);
  s = apply(s, option(s, data => data.type === "play" && data.cid !== undefined && s.cards[data.cid].name === "taoyuan"));
  while (decision(s)?.kind === "nullify") s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(s.players[0].hp, 4);
  assert.equal(s.players[1].hp, 3);

  const save = fixture();
  save.hand(0, "sha");
  save.hand(1, "tao");
  save.hand(1, "tao");
  save.state.players[1].hp = 1;
  s = save.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(decision(s)?.kind, "dying");
  s = apply(s, option(s, data => data.type === "save"));
  assert.equal(s.players[1].hp, 1);
  assert.equal(s.outcome.status, 'ongoing');
});

test("顺手牵羊可选装备，过河拆桥可选判定区；五谷丰登可被无懈逐目标抵消", () => {
  const steal = fixture();
  steal.hand(0, "shunshou");
  const weapon = steal.equip(1, "zhuge", "weapon");
  let s = steal.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.cid === weapon));
  assert.ok(s.players[0].hand.includes(weapon));

  const dismantle = fixture();
  dismantle.hand(0, "guohe");
  const delayed = dismantle.take("lebu");
  dismantle.state.players[1].judge.push(delayed);
  s = dismantle.start();
  s = apply(s, option(s, data => data.type === "play"));
  s = apply(s, option(s, data => data.cid === delayed));
  assert.ok(s.discard.includes(delayed));

  const harvest = fixture();
  harvest.hand(0, "wugu");
  harvest.hand(0, "wuxie");
  s = harvest.start();
  s = apply(s, option(s, data => data.type === "play" && data.cid !== undefined && s.cards[data.cid].name === "wugu"));
  while (decision(s)?.kind === "nullify") s = apply(s, option(s, data => data.type === "pass"));
  assert.equal(decision(s)?.kind, "wugu");
  s = apply(s, option(s, data => data.type === "wugu"));
  assert.equal(decision(s)?.kind, "nullify");
  s = apply(s, option(s, data => data.type === "nullify"));
  assert.notEqual(decision(s)?.kind, "wugu");
  assert.equal(s.players[1].hand.length, 0);
});

test("顺手牵羊与过河拆桥可选择具体暗手牌位置，决策不公开牌面", () => {
  for (const [trick, slot, effect] of [["shunshou", 1, "gain"], ["guohe", 2, "discard"]] as const) {
    const f = fixture();
    const trickId = f.hand(0, trick);
    const hidden = [f.hand(1, "sha"), f.hand(1, "tao"), f.hand(1, "shan")];
    let s = f.start();
    s = apply(s, option(s, data => data.type === "play" && data.cid === trickId));
    const choices = legalActions(s).filter(choice => choice.data?.type === "zone" && choice.data.zone === "hand");
    assert.deepEqual(choices.map(choice => choice.data && 'slot' in choice.data ? choice.data.slot : undefined), [0, 1, 2]);
    assert.ok(choices.every(choice => choice.data && !("cid" in choice.data)));
    assert.doesNotMatch(choices.map(choice => choice.label).join(" "), /【杀】|【桃】|【闪】/);
    s = apply(s, option(s, data => data.zone === "hand" && data.slot === slot));
    assert.equal(s.players[1].hand.includes(hidden[slot]), false);
    assert.equal(effect === "gain" ? s.players[0].hand.includes(hidden[slot]) : s.discard.includes(hidden[slot]), true);
    assert.ok(s.players[1].hand.includes(hidden[(slot + 1) % hidden.length]));
  }
});

test("丈八蛇矛的两张黑牌视为黑色杀，仁王盾令其无效", () => {
  const f = fixture();
  f.hand(0, "sha", "spade");
  f.hand(0, "sha", "club");
  f.equip(0, "zhangba", "weapon");
  f.equip(1, "renwang", "armor");
  let s = f.start();
  s = apply(s, option(s, data => data.type === "virtualSha"));
  assert.equal(s.players[1].hp, 4);
  assert.match(debugLog(s).join("；"), /仁王盾/);
});

test("丈八蛇矛手牌不足两张时不出现空的交互选项", () => {
  const f = fixture();
  f.equip(0, "zhangba", "weapon");
  f.hand(0, "shan");
  const state = f.start();
  assert.ok(!decision(state)?.options.some(choice => choice.id === "zhangba"));
});

test("弃牌堆洗回牌堆后继续摸牌，所有实体牌仍唯一", () => {
  const f = fixture();
  f.hand(0, "wuzhong");
  f.state.discard.push(...f.state.deck.splice(0));
  let s = f.start();
  s = apply(s, option(s, data => data.type === "play"));
  assert.equal(s.players[0].hand.length, 2);
  assert.match(debugLog(s).join("；"), /弃牌堆洗回牌堆/);
  assert.equal(new Set(zones(s)).size, 108);
});

test("相同随机种子与决策序列可复现，对局画面完整使用中文", () => {
  const first = GameEngine.standard({ seed: 19 });
  const second = GameEngine.standard({ seed: 19 });
  const policy = new RuleBasePolicy();
  for (let step = 0; step < 25; step++) {
    const left = first.getDecision();
    const right = second.getDecision();
    assert.deepEqual(left, right);
    if (!left) break;
    const choice = policy.choose(first.getObservation(left.actor), left);
    first.choose(choice);
    second.choose(choice);
  }
  assert.deepEqual(first.getObservation(0), second.getObservation(0));
  const board = new ChineseView().board(first.getObservation(0));
  const lines = board.split("\n");
  assert.ok(lines.every(line => line.startsWith("|") && line.endsWith("|") || line.startsWith("+") && line.endsWith("+")));
  assert.doesNotMatch(board, /\b(sha|shan|tao|play|judge)\b/);
});

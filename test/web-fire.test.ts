import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { bindModeSelection, createBrowserSession, gameUrl, generalPacksFromQuery } from '../src/web/game-setup.ts';
import { contentForCards, type GeneralPack } from '../src/app/game-content.ts';
import { fireGeneralDefinitions } from '../src/content/fire/content.ts';
import { selectionDetails } from '../src/web/selection-preview.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { fixture } from './support/scenario-builder.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { preparePlayScenario } from '../src/app/standard-game.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { IdentityGeneralSelector } from '../src/app/identity-general-selector.ts';
import { DuelGeneralSelector } from '../src/app/duel-general-selector.ts';
import { ChineseView } from '../chinese-view.ts';
import { StandardRuleset } from '../src/app/standard-game.ts';
import { eventSounds } from '../src/web/sound-cues.ts';
import { trickTableCue } from '../src/web/trick-table-cue.ts';
import type { AssetManifest } from '../src/web/assets.ts';
const root = resolve(import.meta.dirname, '..');

test('火包八将原卡面、技能及阵亡语音齐全，选将说明完整且识别火将', () => {
  const m = JSON.parse(readFileSync(resolve(root, 'public/assets/manifest.json'), 'utf8'));
  for (const g of fireGeneralDefinitions) {
    for (const url of [m.generals[g.id], m.generalAudio[g.id]?.death, m.generalAudio[g.id]?.selection]) {
      assert.ok(url, g.label); assert.ok(existsSync(resolve(root, 'public' + url)));
    }
    const preview = selectionDetails(g.id, true); assert.ok(preview.title.includes(g.label)); assert.equal(preview.skills.length, g.abilities.length);
    assert.ok(preview.skills.every(s => s.body.length > 10));
    for (const id of g.abilities.filter(id => !['fire.mashu', 'fire.xueyi'].includes(id))) assert.ok(m.generalAudio[g.id].skills[id]?.length, id);
  }
});

test('启动页风火分别勾选，两种玩法及牌堆的八种组合都按配置建局', () => {
  const elements: Record<string, {checked: boolean; onclick?: () => void}> = Object.fromEntries(
    ['cards-standard', 'cards-junzheng', 'generals-wind', 'generals-fire', 'mode-duel', 'mode-identity'].map(id => [id, { checked: false }]));
  const sessions: ReturnType<typeof createBrowserSession>[] = [];
  bindModeSelection({ getElementById: (id: string) => elements[id] } as unknown as Document,
    new URLSearchParams('generals=fire'), (mode, cards, packs) => sessions.push(createBrowserSession(mode, 1, cards, packs)));
  assert.equal(elements['generals-fire'].checked, true); assert.equal(elements['generals-wind'].checked, false);
  for (const cards of ['standard', 'junzheng'] as const) for (const packs of [[], ['wind'], ['fire'], ['wind', 'fire']] as GeneralPack[][]) {
    elements['cards-junzheng'].checked = cards === 'junzheng';
    elements['generals-wind'].checked = packs.includes('wind'); elements['generals-fire'].checked = packs.includes('fire');
    for (const mode of ['duel', 'identity'] as const) {
      elements[`mode-${mode}`].onclick!(); const session = sessions.at(-1)!; session.start(session.candidates[0].id);
      assert.deepEqual(session.record!.config.generalPacks, packs); assert.equal(session.record!.config.cards, cards);
      assert.equal(session.mode, mode);
    }
  }
});

test('重开、返回主页及结算链接保留独立或组合风火，去除mode后回主页面且清除seed', () => {
  for (const packs of [[], ['wind'], ['fire'], ['wind', 'fire']] as GeneralPack[][]) for (const mode of ['duel', 'identity', undefined] as const) {
    const url = new URL(gameUrl('/sanguoce/', 'junzheng', mode, packs), 'https://example.com');
    assert.deepEqual(generalPacksFromQuery(url.searchParams), packs); assert.equal(url.searchParams.get('mode'), mode ?? null);
    assert.equal(url.pathname, '/sanguoce/'); assert.equal(url.searchParams.has('seed'), false);
  }
  assert.deepEqual(generalPacksFromQuery(new URLSearchParams('generals=fire,invalid,wind,fire')), ['wind', 'fire']);
});

test('袁绍与张角都进入主公候选，七选一无重复且未勾选包的武将不会出现', () => {
  const content = contentForCards('standard', ['wind', 'fire']);
  const offer = new IdentityGeneralSelector(new DuelGeneralSelector(content.generals(), content)).offer(7, 0);
  assert.equal(offer.candidates[0].length, 7);
  assert.ok(['fire.yuanshao', 'wind.zhangjiao'].every(id => offer.candidates[0].some(g => g.id === id)));
  const ids = offer.candidates.flatMap(pool => pool.map(g => g.id)); assert.equal(new Set(ids).size, ids.length);
});

test('乱击两张费用沿用合法交互；强袭装备武器可在中央选择', () => {
  const content = contentForCards('standard', ['fire']), runtime = new ContentRuntime(content);
  const f = fixture(5, { generalPacks: ['fire'] }); f.state.players[0].general = 'fire.dianwei'; const weapon = f.equip(0, 'qinggang', 'weapon');
  const s = preparePlayScenario(f.state, 0, runtime); const obs = observe(s, 0); const model = new TableInteraction(decision(s)!, obs.self.hand);
  const choices = model.leaves.filter(c => c.ability === 'fire.qiangxi'); model.scope({ id: 'ui:fire.qiangxi', label: '强袭', cardIds: [], targetIds: [], children: choices });
  assert.equal(zonePickerChoices(obs, model)[0]?.card?.id, weapon); assert.ok(model.selectCard(weapon)); assert.ok(model.selectTarget(1)); assert.equal(model.exact.length, 1);
  const y = fixture(5, { generalPacks: ['fire'] }); y.state.players[0].general = 'fire.yuanshao'; const a = y.hand(0, 'sha', 'heart'), b = y.hand(0, 'shan', 'heart');
  const state = preparePlayScenario(y.state, 0, runtime); const ui = new TableInteraction(decision(state)!, observe(state, 0).self.hand);
  ui.scope({ id: 'ui:fire.luanji', label: '乱击', ability: 'fire.luanji', cardIds: [], targetIds: [],
    children: ui.leaves.filter(c => c.ability === 'fire.luanji') });
  assert.ok(ui.selectCard(a)); assert.ok(ui.selectCard(b)); assert.ok(ui.exact.some(c => c.ability === 'fire.luanji'));
  assert.ok(legalActions(state).some(o => o.data?.type === 'virtualTrick'));
});

test('模型上下文显示火包技能及涅槃使用状态，其他角色暗牌仍然不泄漏', () => {
  const f = fixture(5, { generalPacks: ['fire'] }); f.state.players[0].general = 'fire.pangtong'; f.state.players[0].skillFlags = { 'fire.niepan.used': true };
  f.state.players[1].general = 'fire.xunyu'; const secret = f.hand(1, 'sha');
  const obs = observe(f.state, 0); const text = new ChineseView().stateForDecision(obs, { actor: 0, kind: 'play', title: '出牌', options: [] });
  assert.match(text, /涅槃/); assert.match(text, /已用限定技/); assert.match(text, /驱虎/); assert.ok(!('hand' in obs.others[0]));
  assert.ok(!obs.eventCards?.[secret]);
});

test('驱虎拼点手牌可直接选择，连环两目标与天义丈八目标可逆序点选', () => {
  const content = contentForCards('standard', ['fire']), runtime = new ContentRuntime(content), rules = new StandardRuleset(undefined, undefined, content);
  const f = fixture(5, { generalPacks: ['fire'] }); f.state.players[0].general = 'fire.xunyu'; f.state.players[0].hp = 3;
  const card = f.hand(0, 'sha'); f.hand(1, 'shan'); let s = preparePlayScenario(f.state, 0, runtime);
  s = rules.apply(s, legalActions(s).find(o => o.data?.type === 'activeSkill' && o.data.ability === 'fire.quhu')!.id);
  const point = new TableInteraction(decision(s)!, observe(s, 0).self.hand); assert.ok(point.selectCard(card)); assert.equal(point.exact[0]?.actionType, 'pindian');

  for (const g of ['fire.pangtong', 'fire.taishici']) {
    const y = fixture(5, { generalPacks: ['fire'] }); y.state.players[0].general = g;
    const a = y.hand(0, 'wuxie', 'club');
    if (g === 'fire.taishici') { y.hand(0, 'tao'); y.equip(0, 'zhangba', 'weapon');
      y.state.skillUses = [{ owner: 0, ability: 'fire.tianyi', turn: y.state.turn, count: 1 }]; y.state.players[0].skillFlags = { 'fire.tianyi.win': true }; }
    const state = preparePlayScenario(y.state, 0, runtime), ui = new TableInteraction(decision(state)!, observe(state, 0).self.hand);
    const ability = g === 'fire.pangtong' ? 'fire.lianhuan' : 'standard.zhangba';
    ui.scope({ id: `ui:${ability}`, label: '转化', cardIds: [], targetIds: [], children: ui.leaves.filter(c => c.ability === ability || ability === 'standard.zhangba' && c.actionType === 'virtualSha') });
    for (const id of state.players[0].hand) assert.ok(ui.selectCard(id));
    assert.ok(ui.cards.includes(a)); assert.equal(ui.unorderedTargets, true);
    assert.ok(ui.selectTarget(3)); assert.ok(ui.selectTarget(1)); assert.equal(ui.exact.length, 1);
  }
});

test('连环重铸只播重铸牌语音，看破桌面显示有效无懈而非费用牌', () => {
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/assets/manifest.json'), 'utf8')) as AssetManifest;
  const f = fixture(2, { generalPacks: ['fire'] }); f.state.players[0].general = 'fire.pangtong'; const cost = f.hand(0, 'sha', 'club');
  const obs = observe(f.state, 0); obs.eventCards = { [cost]: f.state.cards[cost] };
  const transformed = { id: 1, kind: 'transformationUsed', data: { owner: 0, ability: 'fire.lianhuan', label: '连环', produces: 'tiesuo' } } as const;
  const recast = { id: 2, kind: 'cardRecast', data: { player: 0, card: cost } } as const; obs.events = [transformed, recast];
  assert.equal(eventSounds(transformed, obs, manifest).length, 1);
  assert.deepEqual(eventSounds(recast, obs, manifest), [manifest.cardAudio.tiesuoRecast?.male]);
  const cue = trickTableCue({ id: 3, kind: 'nullificationUsed', data: { player: 0, card: cost, cname: 'guohe', target: 1, parityBefore: 0 } }, obs);
  assert.equal(cue?.kind === 'append' ? cue.card.name : null, 'wuxie');
});

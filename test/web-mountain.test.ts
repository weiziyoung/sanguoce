import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bindModeSelection, createBrowserSession, gameUrl, generalPacksFromQuery } from '../src/web/game-setup.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { mountainGeneralDefinitions } from '../src/content/mountain/content.ts';
import { selectionDetails } from '../src/web/selection-preview.ts';
import { IdentityGeneralSelector } from '../src/app/identity-general-selector.ts';
import { DuelGeneralSelector } from '../src/app/duel-general-selector.ts';
import { mountainScene as scene } from './support/mountain-scenario.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { decision } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { ChineseView } from '../chinese-view.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
const root = resolve(import.meta.dirname, '..');
test('山包八将立绘、所有原技能及觉醒派生技能语音、选将和阵亡完整', () => {
  const m = JSON.parse(readFileSync(resolve(root, 'public/assets/manifest.json'), 'utf8'));
  for (const g of mountainGeneralDefinitions) {
    for (const url of [m.generals[g.id], m.generalAudio[g.id]?.death, m.generalAudio[g.id]?.selection]) { assert.ok(url, g.label); assert.ok(existsSync(resolve(root, 'public' + url))); }
    for (const id of g.abilities) { assert.ok(m.generalAudio[g.id].skills[id]?.length, id); for (const url of m.generalAudio[g.id].skills[id]) assert.ok(existsSync(resolve(root, 'public' + url))); }
    assert.ok(selectionDetails(g.id, true).skills.every(s => s.body.length > 10));
  }
  for (const [g, skill] of [['mountain.dengai','mountain.jixi'], ['mountain.sunce','standard.yingzi'], ['mountain.sunce','mountain.yinghun']]) assert.ok(m.generalAudio[g].skills[skill]?.length);
});
test('山包勾选支持两种玩法、32个卡包组合及返回主页和重开配置', () => {
  const elements: Record<string, {checked: boolean; onclick?: () => void}> = Object.fromEntries(['cards-standard','cards-junzheng','mode-duel','mode-identity', ...GENERAL_PACKS.map(p => `generals-${p}`)].map(id => [id, {checked: false}]));
  const sessions: ReturnType<typeof createBrowserSession>[] = [];
  bindModeSelection({getElementById: (id: string) => elements[id]} as unknown as Document, new URLSearchParams('generals=mountain'), (mode, cards, packs) => sessions.push(createBrowserSession(mode, 7, cards, packs)));
  assert.equal(elements['generals-mountain'].checked, true);
  for (const cards of ['standard','junzheng'] as const) for (let mask = 0; mask < 16; mask++) {
    const packs = GENERAL_PACKS.filter((_, i) => mask & (1 << i)); elements['cards-junzheng'].checked = cards === 'junzheng';
    for (const pack of GENERAL_PACKS) elements[`generals-${pack}`].checked = packs.includes(pack);
    for (const mode of ['duel','identity'] as const) { elements[`mode-${mode}`].onclick!(); const s = sessions.at(-1)!; s.start(s.candidates[0].id); assert.deepEqual(s.record!.config.generalPacks, packs); assert.equal(s.record!.config.cards, cards); }
    for (const mode of ['duel','identity',undefined] as const) assert.deepEqual(generalPacksFromQuery(new URL(gameUrl('/sanguoce/', cards, mode, packs), 'https://example.com').searchParams), packs);
  }
});
test('山包启用刘禅孙策主公，全部包主公十一选一无重复', () => {
  const c = contentForCards('standard', GENERAL_PACKS); const offer = new IdentityGeneralSelector(new DuelGeneralSelector(c.generals(), c)).offer(7, 0);
  assert.equal(offer.candidates[0].length, 11); assert.ok(['mountain.liushan','mountain.sunce'].every(id => offer.candidates[0].some(g => g.id === id)));
  const ids = offer.candidates.flatMap(pool => pool.map(g => g.id)); assert.equal(ids.length, new Set(ids).size);
});
test('急袭田与巧变其他角色装备在中央选牌器显示且可选择', () => {
  const x = scene(); x.general(0, 'mountain.dengai'); const id = x.f.take('sha'); x.f.state.players[0].piles = {'mountain.tuntian': [id]}; x.f.state.players[0].gainedAbilities = ['mountain.jixi']; x.f.hand(1, 'sha'); const s = x.start(), obs = observe(s, 0);
  const model = new TableInteraction(decision(s)!, obs.self.hand); const children = model.leaves.filter(c => c.ability === 'mountain.jixi'); model.scope({id:'ui:mountain.jixi',label:'急袭',cardIds:[],targetIds:[],children}); assert.ok(zonePickerChoices(obs, model).some(p => p.card?.id === id && p.zone === 'pile')); assert.ok(model.selectCard(id));
  const y = scene(5); y.general(0, 'mountain.zhanghe'); const cost = y.f.hand(0, 'sha'), equipment = y.f.equip(1, 'bagua', 'armor'); let state = y.tasks({kind:'phaseBefore', phase:'play'}); state = y.choose(state, d => d.type === 'choose' && 'ids' in d && d.ids[0] === cost); const o = observe(state,0);
  assert.ok(zonePickerChoices(o,new TableInteraction(decision(state)!,o.self.hand)).some(p => p.card?.id === equipment));
});
test('模型视角含觉醒技能、田与化身状态，仅左慈本人知道未公开化身', () => {
  const x = scene(); x.general(0, 'mountain.zuoci'); x.f.state.players[0].huashen = {generals:['standard.guanyu','standard.zhenji'],selected:'standard.guanyu',ability:'standard.wusheng'}; x.f.state.players[0].gainedAbilities = ['standard.wusheng'];
  openContentChoice(x.f.state, 0, 'mountain.huashen', {timing:'change'}); const s = x.advance(x.f.state);
  const view = new ChineseView(); const own = view.stateForDecision(observe(s,0),decision(s)!); assert.ok(own.includes('化身')); assert.ok(own.includes('武圣')); assert.equal(observe(s,1).others[0].huashen!.generals, undefined);
  const y = scene(); y.general(0,'mountain.dengai'); y.f.state.players[0].gainedAbilities = ['mountain.jixi']; y.f.state.players[0].skillFlags = {'mountain.zaoxian.awakened': true}; const id = y.f.take('sha'); y.f.state.players[0].piles = {'mountain.tuntian':[id]}; const t=y.start(); assert.ok(view.stateForDecision(observe(t,0),decision(t)!).includes('急袭'));
});

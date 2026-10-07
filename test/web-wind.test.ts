import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bindModeSelection, createBrowserSession, generalPacksFromQuery, gameUrl } from '../src/web/game-setup.ts';
import { windGeneralDefinitions } from '../src/content/wind/content.ts';
import { selectionDetails } from '../src/web/selection-preview.ts';
import { contentForCards } from '../src/app/game-content.ts';
import { DuelGeneralSelector } from '../src/app/duel-general-selector.ts';
import { IdentityGeneralSelector } from '../src/app/identity-general-selector.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { ChineseView } from '../chinese-view.ts';
import { fixture } from './support/scenario-builder.ts';
import { observe } from '../src/core/observation-projector.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { decision } from '../src/core/decision-manager.ts';
import type { AssetManifest } from '../src/web/assets.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
test('风包7将图片、技能/阵亡/选将声音已打包，完整说明包含天香原来源与自动狂骨', () => {
  const manifest = JSON.parse(readFileSync(root + 'public/assets/manifest.json', 'utf8')) as AssetManifest;
  for (const general of windGeneralDefinitions) {
    assert.ok(existsSync(root + 'public' + manifest.generals[general.id]));
    const voice = manifest.generalAudio[general.id]; assert.ok(voice.death && voice.selection);
    for (const path of [voice.death, voice.selection, ...Object.values(voice.skills).flat()]) assert.ok(existsSync(root + 'public' + path));
    const details = selectionDetails(general.id, true); assert.equal(details.skills.length, general.abilities.length);
    assert.ok(details.skills.every(skill => skill.body.length > 8 && !skill.body.includes('暂缺')));
  }
  assert.match(selectionDetails('wind.weiyan', false).skills[0].body, /自动/);
  assert.match(selectionDetails('wind.xiaoqiao', false).skills[0].body, /原伤害来源/);
  assert.equal(selectionDetails('wind.zhangjiao', false).skills.find(s => s.title.includes('黄天'))?.unavailable, true);
});

test('启动页勾选风包，两种卡牌组合/玩法选将建局与轨迹都保留配置；取消恢复标准', () => {
  const nodes: Record<string, { checked?: boolean; onclick?: () => void }> = {
    'cards-standard': { checked: true }, 'cards-junzheng': { checked: false }, 'generals-wind': { checked: false }, 'mode-duel': {}, 'mode-identity': {},
  };
  const document = { getElementById: (id: string) => nodes[id] } as unknown as Document;
  const sessions: ReturnType<typeof createBrowserSession>[] = [];
  bindModeSelection(document, new URLSearchParams('generals=wind'), (mode, cards, packs) => sessions.push(createBrowserSession(mode, 7, cards, packs)));
  assert.equal(nodes['generals-wind'].checked, true);
  for (const junzheng of [false, true]) {
    nodes['cards-junzheng'].checked = junzheng;
    nodes['mode-duel'].onclick!(); nodes['mode-identity'].onclick!();
  }
  for (const session of sessions) {
    assert.deepEqual(session.generalPacks, ['wind']); session.start(session.candidates[0].id);
    assert.deepEqual(session.record!.config.generalPacks, ['wind']);
    assert.equal(session.game!.finished, false);
  }
  nodes['generals-wind'].checked = false; nodes['mode-duel'].onclick!(); assert.deepEqual(sessions.at(-1)!.generalPacks, []);
  assert.deepEqual(generalPacksFromQuery(new URLSearchParams('generals=invalid')), []);
});

test('重开、再来一局、返回模式页保留风包及牌包，重新抽取种子', () => {
  for (const mode of ['duel', 'identity', undefined] as const) {
    const url = new URL(gameUrl('/sanguoce/', 'junzheng', mode, ['wind']), 'https://example.com');
    assert.deepEqual(generalPacksFromQuery(url.searchParams), ['wind']); assert.equal(url.searchParams.get('cards'), 'junzheng');
    assert.equal(url.searchParams.has('seed'), false); assert.equal(url.searchParams.get('mode'), mode ?? null);
  }
});

test('张角进入主公候选，四主公选将不重复，非主公也可抽到风将', () => {
  const content = contentForCards('standard', ['wind']); const selector = new DuelGeneralSelector(content.generals(), content);
  const offer = new IdentityGeneralSelector(selector).offer(7, 0);
  assert.equal(offer.candidates[0].length, 6); assert.ok(offer.candidates[0].some(g => g.id === 'wind.zhangjiao'));
  const ids = offer.candidates.flatMap(pool => pool.map(g => g.id)); assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new IdentityGeneralSelector(selector).offer(7, 0), offer);
});

test('天香合法候选可通过选手牌、点目标和确认提交；不屈与鬼道装备可见', () => {
  const content = contentForCards('standard', ['wind']); const runtime = new ContentRuntime(content);
  const f = fixture(5); f.state.players[1].general = 'wind.xiaoqiao'; const cid = f.hand(1, 'sha', 'spade');
  damage(f.state, 1, 0); createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  const model = new TableInteraction(decision(f.state)!, observe(f.state, 1).self.hand);
  assert.ok(model.selectCard(cid)); assert.ok(model.selectTarget(2)); assert.equal(model.exact.length, 1);
  const equip = f.equip(1, 'bagua', 'armor'); const obs = observe(f.state, 1);
  const equipment = new TableInteraction({ actor: 1, kind: 'judgeReplace', title: '鬼道', options: [{ id: 'replace', label: '黑色装备', data: { type: 'replace', cid: equip } }] });
  assert.equal(zonePickerChoices(obs, equipment)[0].card?.id, equip);
});

test('模型视角包含风将完整规则、翻面和公开不屈牌；对手暗牌不泄露', () => {
  const f = fixture(); f.state.players[0].general = 'wind.zhoutai'; f.state.players[0].faceDown = true;
  const pile = f.take('sha', 'spade', 7); f.state.players[0].piles = { 'wind.buqu': [pile] };
  f.state.players[1].general = 'wind.xiaoqiao'; f.hand(1, 'wuzhong');
  const obs = observe(f.state, 0); const view = new ChineseView();
  const text = view.stateForDecision(obs, { actor: 0, kind: 'play', title: '出牌', options: [] });
  assert.match(text, /背面朝上/); assert.match(text, /不屈牌点数：7/); assert.match(text, /原伤害来源/);
  assert.doesNotMatch(text, /手牌.*内容.*无中生有/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cardAssetKey, cardText, type Card } from '../catalog.ts';
import { expandedContent } from '../src/app/game-content.ts';
import { BrowserDuel } from '../src/app/browser-duel.ts';
import { BrowserIdentity } from '../src/app/browser-identity.ts';
import { GameEngine } from '../engine.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EXPANDED_DECK } from '../catalog.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { contextActionChoices } from '../src/web/hud.ts';
import { eventSounds } from '../src/web/sound-cues.ts';
import { tableCardLabel } from '../src/web/table-card-label.ts';
import { EQUIPMENT_HELP } from '../src/presentation/equipment-help.ts';
import { responseCard } from '../src/web/response-card.ts';
import type { AssetManifest } from '../src/web/assets.ts';
import type { VisibleEvent } from '../src/domain/events.ts';

const manifest: AssetManifest = JSON.parse(readFileSync(new URL('../public/assets/manifest.json', import.meta.url), 'utf8'));
test('军争每种牌图、男女语音、铁索重铸和BGM都已捆绑，装备有悬停说明', () => {
  for (const key of ['jiu', 'huogong', 'tiesuo', 'bingliang', 'hualiu', 'guding', 'zhuque', 'tengjia', 'baiyin', 'huosha', 'leisha']) {
    for (const url of [manifest.cards[key], manifest.cardAudio[key]?.male, manifest.cardAudio[key]?.female]) {
      assert.ok(url, key);
      assert.ok(existsSync(resolve(import.meta.dirname, '../public', url.slice(1))), url);
    }
  }
  for (const url of [manifest.cardAudio.tiesuoRecast.male, manifest.cardAudio.tiesuoRecast.female, manifest.bgm, manifest.outsideBgm]) {
    assert.ok(url);
    assert.ok(existsSync(resolve(import.meta.dirname, '../public', url.slice(1))));
  }
  assert.ok(expandedContent.cards().filter(c => c.kind === 'equip').every(c => EQUIPMENT_HELP[c.id]));
});

test('属性杀选择正确牌图、语音和桌面名称，转化后的杀清除原有属性', () => {
  const obs = GameEngine.junzheng().getObservation(0);
  const card: Card = { id: 999, name: 'sha', nature: 'fire', suit: 'heart', rank: 4 };
  obs.eventCards = { 999: card };
  const event: VisibleEvent = { id: 1, kind: 'cardUsed', data: { source: 0, card: 999, targets: [1] } };
  assert.equal(cardAssetKey(card), 'huosha');
  assert.match(cardText(card), /火杀/);
  assert.match(tableCardLabel(event, obs)!, /火杀/);
  assert.deepEqual(eventSounds(event, obs, manifest), [manifest.cardAudio.huosha.male]);
  const wine: VisibleEvent = { id: 2, kind: 'cardUsed', data: { source: 0, card: 1000, targets: [] } };
  obs.eventCards[1000] = { id: 1000, name: 'jiu', suit: 'club', rank: 3 };
  assert.match(tableCardLabel(wine, obs)!, /酒\n你/);
  const discarded: VisibleEvent = { id: 3, kind: 'discarded', data: { player: 0, card: 999, reason: 'respond' } };
  const transformed: VisibleEvent = { id: 4, kind: 'transformationUsed', data: { owner: 0, ability: 'standard.wusheng', label: '武圣', produces: 'sha' } };
  obs.events = [discarded, transformed];
  assert.equal(responseCard(transformed, obs)?.card.nature, undefined);
});

test('铁索选择手牌即可显示重铸入口，也可确认一或两个目标；火攻使用普通选牌模型', () => {
  const model = new TableInteraction({ actor: 0, kind: 'play', title: '出牌', options: [
    { id: 'play:1:0', label: '自己', data: { type: 'play', cid: 1, targets: [0] } },
    { id: 'play:1:0:1', label: '两人', data: { type: 'play', cid: 1, targets: [0, 1] } },
    { id: 'recast:1', label: '重铸', data: { type: 'recast', cid: 1 } },
  ] });
  model.selectCard(1);
  assert.deepEqual(contextActionChoices(model).map(c => c.actionType), ['recast']);
  model.selectTarget(0);
  assert.ok(model.exact.some(c => c.id === 'play:1:0'));
  assert.deepEqual(model.nextTargets, [1]);
  model.selectTarget(1);
  assert.equal(model.exact[0].id, 'play:1:0:1');
  const reveal = new TableInteraction({ actor: 1, kind: 'fireAttackReveal', title: '展示', options: [
    { id: 'show:2', label: '牌', data: { type: 'reveal', cid: 2 } },
  ] });
  assert.ok(reveal.selectCard(2));
  assert.equal(reveal.exact[0].id, 'show:2');
});

for (const mode of ['duel', 'identity'] as const) test(`军争${mode}网页会话与直接引擎逐步一致，记录保存卡包配置`, () => {
  // Keep the equivalence smoke test bounded; long strategy runs are separate from trace parity.
  const browser = mode === 'duel' ? new BrowserDuel(7, 'junzheng') : new BrowserIdentity(1, 'junzheng');
  browser.start(browser.candidates[0].id);
  const config = browser.record!.config;
  assert.equal(config.cards, 'junzheng');
  const direct = GameEngine.standard(config);
  const policy = new StrategicPolicy(undefined, EXPANDED_DECK);
  let steps = 0;
  while (!browser.finished && steps++ < 3000) {
    const decision = browser.decision!;
    assert.deepEqual(browser.observation, direct.getObservation(browser.humanSeat));
    assert.deepEqual(decision, direct.getDecision());
    const id = policy.choose(direct.getObservation(decision.actor), decision);
    if (decision.actor === browser.humanSeat) browser.choose(id, decision.id!);
    else browser.computerStep();
    direct.choose({ decisionId: decision.id!, optionId: id });
  }
  assert.ok(browser.finished && steps < 3000);
  assert.equal(browser.gameDocument().config.cards, 'junzheng');
});

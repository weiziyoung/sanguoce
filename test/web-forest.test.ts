import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { bindModeSelection, createBrowserSession, gameUrl, generalPacksFromQuery } from '../src/web/game-setup.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { forestGeneralDefinitions } from '../src/content/forest/content.ts';
import { selectionDetails } from '../src/web/selection-preview.ts';
import { IdentityGeneralSelector } from '../src/app/identity-general-selector.ts';
import { DuelGeneralSelector } from '../src/app/duel-general-selector.ts';
import { forestScene as scene } from './support/forest-scenario.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { decision } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { PlayerVitalsPresenter, type PlayerVitalsState } from '../src/web/player-vitals.ts';
const root = resolve(import.meta.dirname, '..');

test('林包八将原版卡图、专属技能、选将与阵亡语音完整且说明覆盖全部技能', () => {
  const m = JSON.parse(readFileSync(resolve(root, 'public/assets/manifest.json'), 'utf8'));
  for (const g of forestGeneralDefinitions) {
    for (const url of [m.generals[g.id], m.generalAudio[g.id]?.death, m.generalAudio[g.id]?.selection]) { assert.ok(url, g.label); assert.ok(existsSync(resolve(root, 'public' + url))); }
    for (const id of g.abilities) for (const url of m.generalAudio[g.id].skills[id] ?? []) assert.ok(existsSync(resolve(root, 'public' + url)), id);
    const preview = selectionDetails(g.id, true); assert.ok(preview.title.includes(g.label)); assert.equal(preview.skills.length, g.abilities.length); assert.ok(preview.skills.every(s => s.body.length > 10));
  }
});

test('启动页风火林分别勾选，两种玩法与两种牌堆的十六组合、返回主页和重开均保留配置', () => {
  const ids = ['cards-standard', 'cards-junzheng', 'generals-wind', 'generals-fire', 'generals-forest', 'generals-mountain', 'generals-yijiang2011', 'mode-duel', 'mode-identity'];
  const elements: Record<string, {checked: boolean; onclick?: () => void}> = Object.fromEntries(ids.map(id => [id, { checked: false }]));
  const sessions: ReturnType<typeof createBrowserSession>[] = [];
  bindModeSelection({ getElementById: (id: string) => elements[id] } as unknown as Document, new URLSearchParams('generals=forest'),
    (mode, cards, packs) => sessions.push(createBrowserSession(mode, 1, cards, packs)));
  assert.equal(elements['generals-forest'].checked, true); assert.equal(elements['generals-fire'].checked, false);
  for (const cards of ['standard', 'junzheng'] as const) for (let mask = 0; mask < 8; mask++) {
    const packs = GENERAL_PACKS.filter((_, i) => mask & (1 << i)); elements['cards-junzheng'].checked = cards === 'junzheng';
    for (const pack of GENERAL_PACKS) elements[`generals-${pack}`].checked = packs.includes(pack);
    for (const mode of ['duel', 'identity'] as const) { elements[`mode-${mode}`].onclick!(); const session = sessions.at(-1)!; session.start(session.candidates[0].id);
      assert.deepEqual(session.record!.config.generalPacks, packs); assert.equal(session.record!.config.cards, cards); }
    for (const mode of ['duel', 'identity', undefined] as const) { const url = new URL(gameUrl('/sanguoce/', cards, mode, packs), 'https://example.com');
      assert.deepEqual(generalPacksFromQuery(url.searchParams), packs); assert.equal(url.searchParams.get('mode'), mode ?? null); assert.equal(url.searchParams.has('seed'), false); }
  }
});

test('曹丕董卓都进入动态主公池，全部风火林主公九选一且无重复', () => {
  const content = contentForCards('standard', ['wind', 'fire', 'forest']); const offer = new IdentityGeneralSelector(new DuelGeneralSelector(content.generals(), content)).offer(7, 0);
  assert.equal(offer.candidates[0].length, 9); assert.ok(['forest.caopi', 'forest.dongzhuo'].every(id => offer.candidates[0].some(g => g.id === id)));
  const ids = offer.candidates.flatMap(pool => pool.map(g => g.id)); assert.equal(new Set(ids).size, ids.length);
});

test('酒池费用牌可选择并确认，缔盟装备费用通过共用中央选牌器展示', () => {
  const x = scene(); x.general(0, 'forest.dongzhuo'); const wine = x.f.hand(0, 'guohe', 'spade'); const s = x.start();
  const model = new TableInteraction(decision(s)!, observe(s, 0).self.hand); model.scope({ id: 'ui:forest.jiuchi', label: '酒池', cardIds: [], targetIds: [], children: model.leaves.filter(c => c.ability === 'forest.jiuchi') });
  assert.ok(model.selectCard(wine)); assert.ok(model.exact.some(c => c.actionType === 'virtualBasic'));
  const y = scene(5); y.general(0, 'forest.lusu'); const equip = y.f.equip(0, 'bagua', 'armor'); const state = y.choose(y.start(), d => d.type === 'beginSkill');
  const obs = observe(state, 0), ui = new TableInteraction(decision(state)!, obs.self.hand); assert.ok(zonePickerChoices(obs, ui).some(c => c.card?.id === equip));
});

test('崩坏降低上限时血条在动画开始前同步新上限与体力', async () => {
  const x = scene(); x.general(0, 'forest.dongzhuo'); let shown: PlayerVitalsState | undefined;
  const presenter = new PlayerVitalsPresenter((id, status) => { if (id === 0) shown = status; }); const obs = observe(x.f.state, 0); presenter.reset([obs.self, ...obs.others]);
  const s = x.choose(x.tasks({kind: 'phaseEnd'}), d => d.type === 'choose' && d.choice === 'maxHp');
  for (const event of observe(s, 0).events) await presenter.play(event, async () => { if (event.kind === 'maxHpChanged') assert.deepEqual(shown, { hp: 7, maxHp: 7, alive: true }); });
});

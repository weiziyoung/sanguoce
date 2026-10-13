import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import type { BrowserSession } from '../src/app/browser-session.ts';
import { TableAssets } from '../src/web/assets.ts';
import type { GameAudio } from '../src/web/audio.ts';
import { GameSettings } from '../src/web/settings.ts';
import type { SkillTile } from '../src/web/hud.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices, type ZonePick } from '../src/web/zone-picker.ts';
import { observe } from '../src/core/observation-projector.ts';
import { decision } from '../src/core/decision-manager.ts';
import { mountainScene, conserved } from './support/mountain-scenario.ts';

// Exercise the actual scene's skill callbacks in Node; substitute only Phaser's
// browser-dependent base class and compile the existing constructor parameter properties.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'phaser' ? 'data:text/javascript,export default { Scene: class {} }' : specifier, context);
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/src/web/table-scene.ts')) return result;
    const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source as Uint8Array).toString();
    return { ...result, format: 'module', source: ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  },
});
const { TableScene } = await import('../src/web/table-scene.ts');
hooks.deregister();

interface SceneHarness {
  busy: boolean;
  model: TableInteraction;
  skills(): SkillTile[];
  clear(): void;
  redraw(): void;
  updateSelection(): void;
}

for (const count of [2, 5]) for (const cards of ['standard', 'junzheng'] as const) {
  test(`${count}人/${cards}：点击急袭铭牌即重绘田牌，选田和目标后合法获得装备`, () => {
    const x = mountainScene(count, cards, count === 5);
    x.general(0, 'mountain.dengai');
    const fields = ['sha', 'shan', 'tao', 'sha'].map(name => x.f.take(name));
    x.f.state.players[0].piles = { 'mountain.tuntian': fields };
    x.f.state.players[0].gainedAbilities = ['mountain.jixi'];
    const hand = x.f.hand(0, 'guohe');
    const target = count === 5 ? 3 : 1;
    const equipment = x.f.equip(target, cards === 'junzheng' ? 'tengjia' : 'bagua', 'armor');
    let state = x.start();
    const obs = observe(state, 0), model = new TableInteraction(decision(state)!, obs.self.hand);
    const scene = new TableScene({ observation: obs, mode: count === 5 ? 'identity' : 'duel' } as BrowserSession,
      new TableAssets({ cards: {}, generals: {}, generalAudio: {}, cardAudio: {}, systemAudio: {} }),
      {} as GameAudio, new GameSettings({ getItem: () => null, setItem: () => {} }));
    const view = scene as unknown as SceneHarness;
    view.busy = false; view.model = model;
    let redraws = 0;
    let drawnPicks: ZonePick[] = [];
    view.updateSelection = () => {};
    view.redraw = () => { redraws++; drawnPicks = zonePickerChoices(obs, model); };
    assert.equal(drawnPicks.length, 0);
    const tile = view.skills().find(skill => skill.id === 'mountain.jixi')!;
    assert.ok(tile.active);
    tile.choose();
    assert.equal(redraws, 1, '发动技能必须重新创建选牌器，不能只更新选中边框');
    assert.deepEqual(drawnPicks.map(pick => [pick.zone, pick.card?.id]), fields.map(id => ['pile', id]));
    assert.equal(model.selectCard(hand), false, '普通手牌不能作为急袭费用');
    assert.equal(model.selectTarget(target), false, '必须先选田');
    assert.ok(model.selectCard(fields[0]));
    assert.deepEqual(model.nextTargets, [target], '其他空手且无装备／判定牌的角色不是合法目标');
    if (count === 5) assert.equal(model.selectTarget(1), false);
    assert.ok(model.selectTarget(target));
    assert.equal(model.exact.length, 1);
    state = x.rules.apply(state, model.exact[0].id);
    state = x.passResponses(state);
    assert.equal(decision(state)?.kind, 'zone');
    state = x.choose(state, data => data.type === 'zone' && data.zone === 'equip' && data.cid === equipment);
    assert.ok(state.players[0].hand.includes(equipment));
    assert.ok(state.discard.includes(fields[0]));
    assert.deepEqual(state.players[0].piles?.['mountain.tuntian'], fields.slice(1));
    conserved(state);

    view.skills().find(skill => skill.id === 'mountain.jixi')!.choose();
    assert.equal(redraws, 2, '再次点击铭牌撤销并重绘');
    assert.equal(model.focus, null);
    assert.deepEqual(drawnPicks, []);
    tile.choose(); view.clear();
    assert.equal(redraws, 4, '通用撤销入口也收起田牌');
    assert.deepEqual(model.cards, []);
    assert.deepEqual(model.targets, []);
    assert.deepEqual(drawnPicks, []);
  });
}

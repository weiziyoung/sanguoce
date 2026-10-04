import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, decision, observe } from '../engine.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { ContentRuntime } from '../src/rules/content-runtime.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { standardModes } from '../src/app/standard-modes.ts';
import { createStandardResolution } from '../src/app/standard-resolution.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { fixture } from './support/scenario-builder.ts';

function qilinChoice(count: number, both: boolean) {
  const f = fixture(count, count === 5 ? { mode: 'identity' } : {});
  const sha = f.hand(0, 'sha');
  const weapon = f.equip(0, 'qilin', 'weapon');
  const ownHorse = f.equip(0, 'jueying', 'plusHorse');
  const targetWeapon = f.equip(1, 'hanbing', 'weapon');
  const armor = f.equip(1, 'bagua', 'armor');
  const minusHorse = f.equip(1, 'dawan', 'minusHorse');
  const plusHorse = both ? f.equip(1, 'dilu', 'plusHorse') : null;
  f.hand(1, 'tao');
  const runtime = new ContentRuntime(standardContent);
  resolutionStack.enqueue(f.state, { kind: 'openTriggers', signal: {
    kind: 'beforeAttackDamage', data: { source: 0, target: 1, sha, ignoreDistance: false },
  }, then: [] });
  createStandardResolution(standardModes, runtime.triggers, runtime).scheduler.advance(f.state);
  const prompt = decision(f.state)!;
  assert.equal(prompt.kind, 'qilin');
  const model = new TableInteraction({ ...prompt,
    options: prompt.options.map(choice => ({ ...choice, label: '任意文案' })) });
  return { state: f.state, model, weapon, ownHorse, targetWeapon, armor, minusHorse, plusHorse };
}

for (const count of [2, 5]) for (const both of [false, true]) {
  test(`${count} 人麒麟弓${both ? '两匹' : '一匹'}坐骑选择展示原牌，点击装备匹配原始合法动作`, () => {
    const { state, model, minusHorse, plusHorse, ownHorse, weapon, targetWeapon, armor } = qilinChoice(count, both);
    const picks = zonePickerChoices(observe(state, 0), model);
    assert.deepEqual(picks.map(pick => pick.card?.id).sort(), [minusHorse, ...(plusHorse ? [plusHorse] : [])].sort());
    assert.ok(picks.every(pick => pick.zone === 'equip' && pick.choice.actionType === 'qilin'));
    for (const pick of picks) {
      assert.deepEqual(pick.card, state.cards[pick.card!.id], '保留完整实体牌和真实花色点数');
      // Same legal-choice lookup used by the equipment row and full-card picker.
      const clicked = model.leaves.find(choice => choice.zone === 'equip' && choice.cardIds.includes(pick.card!.id));
      assert.equal(clicked?.id, pick.choice.id);
      const result = apply(state, clicked!.id);
      assert.ok(result.discard.includes(pick.card!.id));
      assert.equal(result.players[1].equip[pick.card!.id === minusHorse ? 'minusHorse' : 'plusHorse'], null);
      assert.equal(result.players[1].equip.weapon, targetWeapon);
      assert.equal(result.players[1].equip.armor, armor);
      assert.equal(result.players[0].equip.weapon, weapon);
      assert.equal(result.players[0].equip.plusHorse, ownHorse);
      if (both) assert.equal(result.players[1].equip[pick.card!.id === minusHorse ? 'plusHorse' : 'minusHorse'],
        pick.card!.id === minusHorse ? plusHorse : minusHorse);
      assert.notEqual(decision(result)?.kind, 'qilin', '提交后继续结算，不停在原提示');
    }
    assert.ok(picks.every(pick => pick.card!.id !== ownHorse && pick.card!.id !== armor && pick.card!.id !== targetWeapon));
    const pass = model.leaves.find(choice => choice.actionType === 'pass')!;
    assert.equal(pass.zone, undefined);
    const skipped = apply(state, pass.id);
    assert.equal(skipped.players[1].equip.minusHorse, minusHorse);
    assert.equal(skipped.players[1].equip.plusHorse, plusHorse);
    assert.notEqual(decision(skipped)?.kind, 'qilin');
  });
}

test('真实出杀的麒麟弓选择提交后弃坐骑并继续造成伤害', () => {
  const f = fixture();
  const sha = f.hand(0, 'sha');
  f.equip(0, 'qilin', 'weapon');
  const horse = f.equip(1, 'dawan', 'minusHorse');
  let state = f.start();
  const play = new TableInteraction(decision(state)!).leaves.find(choice => choice.actionType === 'play' && choice.cardIds.includes(sha))!;
  state = apply(state, play.id);
  const pass = new TableInteraction(decision(state)!).leaves.find(choice => choice.actionType === 'pass')!;
  state = apply(state, pass.id);
  const model = new TableInteraction(decision(state)!);
  assert.equal(model.decision.kind, 'qilin');
  const pick = zonePickerChoices(observe(state, 0), model)[0];
  assert.equal(pick?.card?.id, horse);
  state = apply(state, pick.choice.id);
  assert.equal(state.players[1].equip.minusHorse, null);
  assert.equal(state.players[1].hp, 3);
  assert.equal(decision(state)?.kind, 'play');
});

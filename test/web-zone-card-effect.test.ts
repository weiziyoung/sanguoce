import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, legalActions, observe } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { zoneCardEffect } from '../src/web/zone-card-effect.ts';
import { hiddenHandSlot } from '../src/web/layout.ts';

test('过河拆桥的选中暗牌带有明确拆牌来源，弃置后才公开牌面', () => {
  const scenario = fixture();
  const trick = scenario.hand(0, 'guohe');
  const cards = [scenario.hand(1, 'sha'), scenario.hand(1, 'tao')];
  let state = scenario.start();
  const use = legalActions(state).find(choice => choice.data?.type === 'play' && choice.data.cid === trick);
  assert.ok(use);
  state = apply(state, use.id);
  const choose = legalActions(state).find(choice => choice.data?.type === 'zone' &&
    choice.data.zone === 'hand' && choice.data.slot === 1);
  assert.ok(choose);
  state = apply(state, choose.id);
  const observation = observe(state, 0);
  const effects = observation.events.map(event => zoneCardEffect(event, observation)).filter(effect => effect !== null);
  assert.deepEqual(effects.map(effect => [effect.kind, effect.from, effect.cardId,
    effect.selection.cause, effect.selection.fromZone]), [['discard', 1, cards[1], 'guohe', 'hand']]);
  assert.equal(effects[0].card?.name, 'tao');
  assert.ok(hiddenHandSlot(1, 2).x > hiddenHandSlot(0, 2).x);
});

test('顺手牵羊暗牌只向当事人显示牌名，旁观者只能看到卡背轨迹', () => {
  const scenario = fixture(5, { mode: 'identity' });
  const trick = scenario.hand(0, 'shunshou');
  const stolen = scenario.hand(1, 'shan');
  let state = scenario.start();
  const use = legalActions(state).find(choice => choice.data?.type === 'play' &&
    choice.data.cid === trick && choice.data.targets[0] === 1);
  assert.ok(use);
  state = apply(state, use.id);
  const choose = legalActions(state).find(choice => choice.data?.type === 'zone' &&
    choice.data.zone === 'hand' && choice.data.slot === 0);
  assert.ok(choose);
  state = apply(state, choose.id);
  const owner = observe(state, 0);
  const witness = observe(state, 2);
  const ownerEffect = owner.events.map(event => zoneCardEffect(event, owner)).find(effect => effect?.kind === 'gain');
  const witnessEffect = witness.events.map(event => zoneCardEffect(event, witness)).find(effect => effect?.kind === 'gain');
  assert.equal(ownerEffect?.cardId, stolen);
  assert.equal(ownerEffect?.card?.name, 'shan');
  assert.equal(witnessEffect?.cardId, null);
  assert.equal(witnessEffect?.card, undefined);
  assert.equal(witness.eventCards?.[stolen], undefined);
  assert.equal(ownerEffect?.selection.cause, 'shunshou');
  assert.equal(ownerEffect?.selection.fromZone, 'hand');
});

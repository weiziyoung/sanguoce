import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, decision, legalActions, observe, type GameState } from '../engine.ts';
import { fixture } from './support/scenario-builder.ts';
import { tableSceneFixture } from './support/table-scene-fixture.ts';

function choose(state: GameState, type: string): GameState {
  const action = legalActions(state).find(option => option.data?.type === type);
  assert.ok(action, `缺少 ${type} 选项`);
  return apply(state, action.id);
}

for (const count of [2, 5, 8]) {
  for (const nullified of [false, true]) {
    test(`${count}人五谷选牌${nullified ? '及无懈响应' : ''}期间，锦囊残留及说明不遮挡亮出的牌`, async () => {
      const f = fixture(count);
      const harvest = f.hand(0, 'wugu');
      if (nullified) f.hand(count - 1, 'wuxie');
      let state = f.start();
      // Also check spectators waiting for the computer to choose a harvest card.
      const self = nullified ? count - 1 : 0;
      const ui = tableSceneFixture(state, self);
      Object.assign(ui.scene, { time: { delayedCall: (_delay: number, complete: () => void) => complete() } });
      try {
        state = choose(state, 'play');
        const obs = observe(state, self);
        const used = obs.events.find(event => event.kind === 'cardUsed' && event.data.card === harvest);
        assert.ok(used);
        await ui.scene.effects.play(used, obs);
        const retained = () => ui.drawings.filter(view => !view.destroyed && view.depth >= 1060 && view.depth < 1100);
        assert.equal(retained().length, 1);
        assert.equal(retained()[0].visible, true, '出牌时先正常显示锦囊及说明');
        ui.load(state);
        assert.ok(retained().every(view => !view.visible), '选牌／无懈窗口收起整个锦囊容器，包括说明');
        assert.equal(ui.scene.effects.hasTableCard(harvest), true, '隐藏仍保留桌面去重');

        if (nullified) {
          assert.equal(decision(state)?.kind, 'nullify');
          state = choose(state, 'nullify');
          const next = observe(state, self);
          const usedNullify = next.events.find(event => event.kind === 'nullificationUsed');
          assert.ok(usedNullify);
          await ui.scene.effects.play(usedNullify, next);
          assert.equal(retained().length, 2);
          assert.ok(retained().every(view => !view.visible), '新追加的无懈从创建时就不覆盖亮出的牌');
          ui.load(state);
        } else {
          assert.equal(decision(state)?.kind, 'wugu');
          const ids = ui.scene.model!.selectableCards;
          assert.equal(ids.length, count);
          assert.equal(ui.scene.cards.filter(sprite => ids.includes(sprite.card.id)).length, count);
          ui.clickCard(ids[0]);
          assert.ok(ui.scene.model!.exact.some(choice => choice.cardIds.includes(ids[0])), '亮出的牌仍可选取');
        }
        while (decision(state)?.kind === 'wugu' || decision(state)?.kind === 'nullify') {
          state = choose(state, decision(state)?.kind === 'wugu' ? 'wugu' : 'pass');
          ui.load(state);
          if (decision(state)?.kind === 'wugu' || decision(state)?.kind === 'nullify')
            assert.ok(retained().every(view => !view.visible), '连续选牌与无懈窗口之间也保持隐藏');
        }
        ui.load(state);
        assert.ok(retained().every(view => view.visible), '结算结束恢复桌面锦囊及说明');
      } finally { ui.dispose(); }
    });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectionCards, selectionRow, type SelectionCardLayout } from '../src/web/selection-layout.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { IdentityGeneralSelector } from '../src/app/identity-general-selector.ts';
import { DuelGeneralSelector } from '../src/app/duel-general-selector.ts';

function fits(cards: SelectionCardLayout[]) {
  for (const card of cards) {
    const top = card.y - card.height / 2, bottom = card.y + card.height / 2;
    assert.ok(card.x - card.width / 2 >= 20 && card.x + card.width / 2 <= 1580, '候选卡不溢出舞台');
    assert.ok(top > 175 && bottom < 800, '候选卡不遮挡身份与页脚');
    assert.ok(card.portraitWidth < card.width && card.portraitY - card.portraitHeight / 2 >= top);
    assert.ok(card.labelY < card.healthY && card.healthY + 12 < card.skillY - 11, '体力和技能各自留行');
    assert.ok(card.skillY + 15 < card.buttonY - card.buttonHeight / 2, '铭牌不遮挡出战按钮');
    assert.ok(card.buttonWidth < card.width && card.buttonY + card.buttonHeight / 2 <= bottom - 3, '按钮完全在卡片内');
  }
  for (let i = 1; i < cards.length; i++) {
    if (cards[i].y === cards[i - 1].y) assert.ok(cards[i - 1].x + cards[i - 1].width / 2 < cards[i].x - cards[i].width / 2, '同排候选卡之间留有空隙');
  }
}

test('三候选与标准主公五候选的体力、技能和按钮互不遮挡', () => {
  fits(selectionCards(3)); fits(selectionCards(5));
  const three = selectionCards(3);
  assert.equal((three[0].x + three[2].x) / 2, 800);
  assert.equal(three[1].x, 800);
});

test('两种牌堆及全部扩展包组合的主公候选均容纳完整战帖', () => {
  for (const cards of ['standard', 'junzheng'] as const) for (let mask = 0; mask < 16; mask++) {
    const content = contentForCards(cards, GENERAL_PACKS.filter((_, i) => mask & (1 << i)));
    const offer = new IdentityGeneralSelector(new DuelGeneralSelector(content.generals(), content)).offer(7, 0);
    const candidates = offer.candidates[0];
    if (candidates.length <= 5) fits(selectionCards(candidates.length));
    else {
      const lords = candidates.filter(g => content.general(g.id).abilities.some(id => content.requireSkill(id).lordSkill));
      const first = selectionRow(lords.length, 334), second = selectionRow(candidates.length - lords.length, 644);
      fits([...first, ...second]);
      assert.ok(first[0].y + first[0].height / 2 < second[0].y - second[0].height / 2, '上下排之间留有空隙');
    }
    for (const pool of offer.candidates.slice(1)) fits(selectionCards(pool.length));
  }
});

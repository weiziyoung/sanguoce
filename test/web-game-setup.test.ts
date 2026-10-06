import test from 'node:test';
import assert from 'node:assert/strict';
import { bindModeSelection, cardsFromQuery, createBrowserSession, gameUrl, type WebMode } from '../src/web/game-setup.ts';
import type { CardSet } from '../src/app/game-content.ts';
import type { Observation } from '../contracts.ts';

function cardCount(obs: Observation): number {
  return obs.deckCount + obs.discardCount + obs.table.length
    + [obs.self, ...obs.others].reduce((count, player) => count + player.handCount
      + Object.values(player.equip).filter(Boolean).length + player.judge.length, 0);
}

function menu(query = '') {
  const elements = {
    'cards-standard': { checked: false },
    'cards-junzheng': { checked: false },
    'mode-duel': { onclick: null as (() => void) | null },
    'mode-identity': { onclick: null as (() => void) | null },
  };
  const root = { getElementById: (id: keyof typeof elements) => elements[id] } as unknown as Document;
  const sessions: ReturnType<typeof createBrowserSession>[] = [];
  bindModeSelection(root, new URLSearchParams(query), (mode, cards) => {
    const session = createBrowserSession(mode, 1, cards);
    session.start(session.candidates[0].id);
    sessions.push(session);
  });
  return { elements, sessions };
}

test('网页默认纯标准，两个玩法按钮实际建立 108 张标准牌对局', () => {
  const { elements, sessions } = menu();
  assert.equal(elements['cards-standard'].checked, true);
  assert.equal(elements['cards-junzheng'].checked, false);
  for (const mode of ['duel', 'identity'] as const) elements[`mode-${mode}`].onclick!();
  assert.deepEqual(sessions.map(session => session.mode), ['duel', 'identity']);
  for (const session of sessions) {
    assert.equal(session.record!.config.cards, 'standard');
    assert.equal(cardCount(session.observation), 108);
  }
});

test('切换牌包后两个玩法均使用所选牌堆，军争可切回纯标准', () => {
  const { elements, sessions } = menu();
  elements['cards-junzheng'].checked = true;
  elements['cards-standard'].checked = false;
  for (const mode of ['duel', 'identity'] as const) elements[`mode-${mode}`].onclick!();
  for (const session of sessions) {
    assert.equal(session.record!.config.cards, 'junzheng');
    assert.equal(cardCount(session.observation), 160);
  }
  elements['cards-standard'].checked = true;
  elements['cards-junzheng'].checked = false;
  elements['mode-duel'].onclick!();
  assert.equal(sessions[2].record!.config.cards, 'standard');
  assert.equal(cardCount(sessions[2].observation), 108);
});

test('无牌包或无效链接恢复标准，显式军争链接同步开局选项', () => {
  for (const search of ['', 'mode=identity&seed=7', 'cards=invalid']) {
    assert.equal(cardsFromQuery(new URLSearchParams(search)), 'standard');
  }
  const { elements } = menu('cards=junzheng');
  assert.equal(elements['cards-junzheng'].checked, true);
  assert.equal(elements['cards-standard'].checked, false);
});

test('重开和再来一局保留模式与牌包，返回模式页保留牌包，新局重新随机种子', () => {
  for (const cards of ['standard', 'junzheng'] as CardSet[]) {
    for (const mode of ['duel', 'identity'] as WebMode[]) {
      const url = new URL(gameUrl('/sanguoce/', cards, mode), 'https://example.com');
      assert.equal(url.pathname, '/sanguoce/');
      assert.equal(url.searchParams.get('mode'), mode);
      assert.equal(cardsFromQuery(url.searchParams), cards);
      assert.equal(url.searchParams.has('seed'), false);
    }
    const menuUrl = new URL(gameUrl('/sanguoce/', cards), 'https://example.com');
    assert.equal(menuUrl.searchParams.has('mode'), false);
    assert.equal(cardsFromQuery(menuUrl.searchParams), cards);
  }
});

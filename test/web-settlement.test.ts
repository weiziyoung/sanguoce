import test from 'node:test';
import assert from 'node:assert/strict';
import { showSettlement } from '../src/web/settlement.ts';
import { mountainScene } from './support/mountain-scenario.ts';
import { observe } from '../src/core/observation-projector.ts';
import type { WebGameDocument } from '../src/app/web-game-record.ts';
import type { RuleEvent } from '../src/domain/events.ts';

class DomNode {
  textContent = ''; className = ''; title = ''; src = ''; alt = ''; scope = '';
  children: DomNode[] = []; dataset: Record<string, string> = {}; styles: Record<string, string> = {};
  style = { gridTemplateColumns: '', setProperty: (key: string, value: string) => { this.styles[key] = value; } };
  classes = new Set<string>();
  classList = { remove: (key: string) => { this.classes.delete(key); }, add: (key: string) => { this.classes.add(key); },
    toggle: (key: string, value: boolean) => { if (value) this.classes.add(key); else this.classes.delete(key); } };
  onclick?: () => void;
  append(...children: DomNode[]) { this.children.push(...children); }
  replaceChildren(...children: DomNode[]) { this.children = children; }
  focus() {}
}
const words = (node: DomNode): string => node.textContent + node.children.map(words).join(' ');
const event = (kind: 'damaged' | 'died', data: object): RuleEvent => ({ id: 1, kind, data, frameId: null, parentEventId: null }) as RuleEvent;

test('结算渲染胜方 MVP、每人本局总积分、排名和分项，平局重新渲染清除旧荣誉', async () => {
  const nodes = new Map<string, DomNode>();
  const get = (id: string) => { if (!nodes.has(id)) nodes.set(id, new DomNode()); return nodes.get(id)!; };
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  Object.assign(globalThis, { document: { getElementById: get, createElement: () => new DomNode() },
    fetch: async () => ({ ok: true, json: async () => ({ id: 'saved-game' }) }) });
  try {
    const x = mountainScene(5, 'standard', true);
    const generals = ['standard.caocao', 'standard.liubei', 'standard.zhangfei', 'standard.guanyu', 'standard.sunquan'];
    generals.forEach((general, i) => x.general(i, general));
    const s = x.f.state;
    s.players[1].alive = false; s.players[1].hp = 0;
    s.outcome = { status: 'finished', winners: [0, 1], losers: [2, 3, 4], reason: 'opposition-eliminated' };
    const game: WebGameDocument = { format: 'sanguosha.web-game.v1', config: { mode: 'identity', seed: 7 },
      humanSeat: 0, startedAt: '2026-10-09T00:00:00Z', finishedAt: '2026-10-09T00:10:00Z', choices: [],
      events: [event('damaged', { source: 2, target: 0, amount: 20 }), event('damaged', { source: 1, target: 2, amount: 4 }), event('died', { source: 2, target: 1 })],
      players: s.players.map(p => ({ id: p.id, label: p.label, general: p.general, role: s.mode.roles[p.id] })), outcome: s.outcome, turn: s.turn };
    showSettlement(observe(s, 0), 'identity', game, { 'standard.liubei': '/assets/generals/standard.liubei.png' });
    assert.equal(get('settlement').dataset.result, 'victory');
    assert.match(words(get('settlement-mvp')), /胜 方.*刘备/);
    assert.match(words(get('settlement-mvp')), /22/);
    assert.equal(get('settlement-mvp').children[0].children[0].src, '/assets/generals/standard.liubei.png');
    const playerCards = get('settlement-players').children;
    assert.equal(playerCards.length, 5);
    assert.ok(playerCards[1].className.includes('mvp'));
    assert.match(words(playerCards[1]), /阵亡/);
    assert.ok(playerCards.every(card => words(card).includes('本局贡献分')));
    const scoreRows = get('settlement-scoreboard').children[1].children;
    assert.equal(scoreRows.length, 5);
    assert.match(words(scoreRows[0]), /张飞/);
    assert.equal(scoreRows[0].className.includes('mvp'), false, '积分最高的败方不标记 MVP');
    assert.ok(scoreRows[1].className.includes('mvp'));
    assert.match(words(get('settlement-score-rules')), /只从胜方评选/);
    assert.match(words(get('settlement-score-rules')), /内奸获胜改为 \+30/);
    assert.equal(get('settlement-earned-points').textContent, '+80');
    assert.match(get('settlement-reward-detail').textContent, /完成对局 \+40.*获胜 \+40/);
    assert.match(get('settlement-reward-rules').textContent, /未完成对局不加分/);
    assert.equal(get('settlement-report').children[1].children.length, 5, '伤害矩阵仍保留');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(get('settlement-upload').textContent, '决策轨迹已保存');
    assert.equal(get('settlement-upload').title, '轨迹编号：saved-game');
    s.outcome = { status: 'draw', reason: 'no-survivors' }; game.outcome = s.outcome;
    showSettlement(observe(s, 0), 'identity', game);
    assert.equal(get('settlement').dataset.result, 'draw');
    assert.match(words(get('settlement-mvp')), /不评 MVP/);
    assert.ok(get('settlement-players').children.every(card => !card.className.includes('mvp')));
    await new Promise(resolve => setImmediate(resolve));
    const duel = observe(s, 0); duel.mode = { id: 'duel' }; duel.others = duel.others.slice(0, 1);
    const duelGame = { ...game, config: { mode: 'duel', seed: 7 }, events: [], players: game.players.slice(0, 2).map(player => ({ ...player, role: undefined })) };
    showSettlement(duel, 'duel', duelGame);
    assert.equal(get('settlement-players').children.length, 2);
    assert.equal(get('settlement-players').style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
    assert.equal(get('settlement-scoreboard').children[1].children.length, 2);
    await new Promise(resolve => setImmediate(resolve));
  } finally { Object.assign(globalThis, previous); }
});

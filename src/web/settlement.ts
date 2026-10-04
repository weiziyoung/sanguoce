import type { Observation } from '../../contracts.ts';
import { roleLabel } from '../../chinese-view.ts';
import { standardContent } from '../content/standard/content.ts';
import type { WebGameDocument } from '../app/web-game-record.ts';
import { battleReport, type BattleStat } from './battle-report.ts';
import { appUrl } from './deployment.ts';

const REASONS: Record<string, string> = {
  'last-survivor': '最后存活的武将获胜',
  'lord-dead': '主公阵亡',
  'opposition-eliminated': '反贼与内奸全部阵亡',
  'renegade-last-survivor': '内奸独自存活',
  'no-survivors': '全员阵亡',
};

export interface SettlementRow {
  seat: number;
  label: string;
  general: string;
  role: string;
  alive: boolean;
  hp: number;
  winner: boolean;
  self: boolean;
}
export interface SettlementSummary {
  result: string;
  winner: string;
  reason: string;
  mode: string;
  turn: number;
  rows: SettlementRow[];
}

/** Builds results only from the final viewer observation. */
export function settlementSummary(obs: Observation): SettlementSummary {
  if (obs.outcome.status === 'ongoing') throw new Error('对局尚未结束');
  const identity = obs.mode.id === 'identity';
  const players = [obs.self, ...obs.others].sort((a, b) => a.id - b.id);
  const winners = obs.outcome.status === 'finished' ? new Set(obs.outcome.winners) : new Set<number>();
  const rows = players.map(player => ({
    seat: player.id + 1, label: player.label,
    general: player.general ? standardContent.general(player.general).label : player.label,
    role: identity ? roleLabel(player.role) : '',
    alive: player.alive, hp: player.hp, winner: winners.has(player.id), self: player.id === obs.self.id,
  }));
  let winner = '平局';
  if (obs.outcome.status === 'finished') {
    if (identity) {
      winner = ({ 'lord-dead': '反贼获胜', 'opposition-eliminated': '主公与忠臣获胜',
        'renegade-last-survivor': '内奸获胜' } as Record<string, string>)[obs.outcome.reason] ??
        obs.outcome.winners.map(id => rows.find(row => row.seat === id + 1)?.label ?? `座${id + 1}`).join('、') + '获胜';
    } else winner = obs.outcome.winners.map(id => rows.find(row => row.seat === id + 1)?.general ?? `座${id + 1}`).join('、') + '获胜';
  }
  return { result: obs.outcome.status === 'draw' ? '平 局' : winners.has(obs.self.id) ? '胜 利' : '落 败',
    winner, reason: REASONS[obs.outcome.reason] ?? obs.outcome.reason,
    mode: identity ? '标准五人身份局' : '标准 1v1', turn: obs.turn, rows };
}

export function showSettlement(obs: Observation, mode: 'duel' | 'identity', game: WebGameDocument): void {
  const summary = settlementSummary(obs);
  const overlay = document.getElementById('settlement')!;
  document.getElementById('settlement-result')!.textContent = summary.result;
  document.getElementById('settlement-winner')!.textContent = summary.winner;
  document.getElementById('settlement-detail')!.textContent = `${summary.mode} · 第 ${summary.turn} 回合 · ${summary.reason}`;
  const list = document.getElementById('settlement-players')!;
  const stats = battleReport(summary.rows.map(row => row.seat - 1),
    Object.fromEntries(game.players.map(player => [player.id, player.role ?? ''])), game.events);
  list.replaceChildren(...summary.rows.map(row => {
    const item = document.createElement('div');
    item.className = `settlement-player${row.winner ? ' winner' : ''}${row.self ? ' self' : ''}`;
    const name = document.createElement('strong'); name.textContent = `座${row.seat} ${row.label} · ${row.general}`;
    const detail = document.createElement('span');
    detail.textContent = `${row.role ? `${row.role} · ` : ''}${row.alive ? `${row.hp} 点体力` : '阵亡'} · ${obs.outcome.status === 'draw' ? '平局' : row.winner ? '胜方' : '败方'}`;
    item.append(name, detail);
    return item;
  }));
  renderReport(summary.rows, stats);
  void uploadGame(game);
  (document.getElementById('settlement-again') as HTMLButtonElement).onclick = () => {
    location.href = `${location.pathname}?mode=${mode}`;
  };
  (document.getElementById('settlement-modes') as HTMLButtonElement).onclick = () => {
    location.href = location.pathname;
  };
  overlay.classList.remove('hidden');
  overlay.focus();
}

function renderReport(rows: SettlementRow[], stats: BattleStat[]): void {
  const table = document.getElementById('settlement-report')!;
  const head = document.createElement('thead');
  const headings = ['武将 / 身份', ...rows.map(row => `伤害→座${row.seat}`), '伤害合计', '治疗', '有效击杀'];
  const header = document.createElement('tr');
  for (const heading of headings) {
    const cell = document.createElement('th'); cell.textContent = heading; header.append(cell);
  }
  head.append(header);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const stat = stats.find(item => item.seat === row.seat - 1)!;
    const line = document.createElement('tr');
    line.className = `${row.winner ? 'winner ' : ''}${row.self ? 'self' : ''}`;
    const values = [`座${row.seat} ${row.general}${row.role ? ` · ${row.role}` : ''}`,
      ...rows.map(target => target.seat === row.seat ? '—' : String(stat.damageByTarget[target.seat - 1] ?? 0)),
      String(stat.damageTotal), String(stat.healing), String(stat.effectiveKills)];
    for (const value of values) {
      const cell = document.createElement('td'); cell.textContent = value; line.append(cell);
    }
    body.append(line);
  }
  table.replaceChildren(head, body);
}

async function uploadGame(game: WebGameDocument): Promise<void> {
  const status = document.getElementById('settlement-upload')!;
  status.textContent = '正在保存本局决策轨迹…';
  try {
    const response = await fetch(appUrl('/api/web-games'), { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(game) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved = await response.json() as { id: string };
    status.textContent = `决策轨迹已保存 · ${saved.id}`;
  } catch {
    status.textContent = '自动保存失败，请点击下载轨迹留存';
    const download = document.getElementById('settlement-download') as HTMLButtonElement;
    download.classList.remove('hidden');
  }
  (document.getElementById('settlement-download') as HTMLButtonElement).onclick = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }));
    link.download = `sanguosha-web-${game.config.seed}-${game.finishedAt.replaceAll(':', '-')}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
}

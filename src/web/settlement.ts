import type { Observation } from '../../contracts.ts';
import { roleLabel } from '../../chinese-view.ts';
import { allContent } from '../app/game-content.ts';
import type { WebGameDocument } from '../app/web-game-record.ts';
import { battleReport, type BattleStat } from './battle-report.ts';
import { battleScores, BATTLE_SCORE_WEIGHTS, type BattleAwards, type BattleScore } from './battle-score.ts';
import { appUrl } from './deployment.ts';
import { generalPackLabel } from '../app/game-content.ts';
import { gameUrl } from './game-setup.ts';
import { playerClient } from './player-client.ts';
import { matchReward, rewardDescription, MATCH_REWARD_RULES, type MatchReward } from './match-reward.ts';

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
  generalId?: string;
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
    general: player.general ? allContent.general(player.general).label : player.label,
    generalId: player.general,
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

export function showSettlement(obs: Observation, mode: 'duel' | 'identity', game: WebGameDocument,
  generalImages: Readonly<Record<string, string>> = {}): void {
  const summary = settlementSummary(obs);
  const overlay = document.getElementById('settlement')!;
  overlay.dataset.result = obs.outcome.status === 'draw' ? 'draw' : summary.rows.some(row => row.self && row.winner) ? 'victory' : 'defeat';
  document.getElementById('settlement-result')!.textContent = summary.result;
  document.getElementById('settlement-winner')!.textContent = summary.winner;
  const cards = game.config.cards ?? 'standard';
  document.getElementById('settlement-detail')!.textContent = `${summary.mode} · ${cards === 'junzheng' ? '标准＋军争' : '标准牌包'}${game.config.generalPacks?.length ? ' · ' + generalPackLabel(game.config.generalPacks) : ''} · 第 ${summary.turn} 回合 · ${summary.reason}`;
  const list = document.getElementById('settlement-players')!;
  const roles = Object.fromEntries(game.players.map(player => [player.id, player.role ?? '']));
  const stats = battleReport(summary.rows.map(row => row.seat - 1), roles, game.events);
  const awards = battleScores(stats, obs.outcome, roles);
  const reward = matchReward(game);
  document.getElementById('settlement-earned-points')!.textContent = `+${reward.total}`;
  document.getElementById('settlement-reward-detail')!.textContent = rewardDescription(reward);
  document.getElementById('settlement-total-points')!.textContent = '保存成功后计入累计积分';
  list.style.gridTemplateColumns = `repeat(${summary.rows.length}, minmax(0, 1fr))`;
  list.replaceChildren(...summary.rows.map(row => {
    const score = awards.scores.find(score => score.seat === row.seat - 1)!;
    const item = element('div', `settlement-player${row.winner ? ' winner' : ''}${row.self ? ' self' : ''}${score.mvp ? ' mvp' : ''}`);
    const header = element('div', 'settlement-player-header');
    const info = element('div', 'settlement-player-info');
    info.append(element('small', 'settlement-seat', `座${row.seat} · ${row.self ? '你' : row.label}`), element('strong', '', row.general));
    header.append(portrait(row, generalImages), info);
    const state = element('div', 'settlement-player-state');
    const role = element('span', 'settlement-role', row.role || '武将');
    role.dataset.role = game.players.find(player => player.id === row.seat - 1)?.role ?? '';
    state.append(role, element('span', '', row.alive ? `${row.hp} 体力` : '阵亡'));
    const footer = element('div', 'settlement-player-score');
    footer.append(element('span', '', '本局贡献分'), element('b', '', String(score.total)));
    item.append(header, state, footer);
    if (score.mvp) item.append(element('span', 'settlement-mvp-ribbon', 'MVP'));
    return item;
  }));
  renderMvp(summary.rows, awards.mvp, generalImages);
  renderScoreboard(summary.rows, awards);
  renderReport(summary.rows, stats);
  const w = BATTLE_SCORE_WEIGHTS;
  document.getElementById('settlement-score-rules')!.textContent = `贡献分：对敌伤害每点 +${w.damage}，实际治疗自己或同阵营角色每点 +${w.healing}，有效击杀每人 +${w.kill}，胜方每人 +${w.victory}，内奸获胜改为 +${w.renegadeVictory}；友伤每点 −${w.friendlyDamage}，误杀队友额外 −${w.friendlyKill}，最低 0。主公与忠臣同阵营，反贼同阵营，内奸无队友。MVP 只从胜方评选，阵亡胜方可获选；同分依次比较有效击杀、对敌伤害、治疗贡献、座次。平局不评 MVP。贡献分用于本局表现排名，累计积分按下面的规则发放。`;
  const d = MATCH_REWARD_RULES.duel, i = MATCH_REWARD_RULES.identity;
  document.getElementById('settlement-reward-rules')!.textContent = `累计积分：1v1 完成 +${d.completion}，表现最多 +${d.performanceCap}，获胜 +${d.victory}；五人身份局完成 +${i.completion}，表现最多 +${i.performanceCap}，获胜 +${i.victory}，内奸获胜额外 +${i.renegade}。表现分来自伤害、治疗、有效击杀并扣除友伤误杀，不重复计算贡献榜的胜利加分。落败、平局也获得完成及表现积分；未完成对局不加分。每局只记一次，游客登录认领时积分一起转入账号。`;
  void uploadGame(game);
  (document.getElementById('settlement-again') as HTMLButtonElement).onclick = () => {
    location.href = gameUrl(location.pathname, cards, mode, game.config.generalPacks);
  };
  (document.getElementById('settlement-modes') as HTMLButtonElement).onclick = () => {
    location.href = gameUrl(location.pathname, cards, undefined, game.config.generalPacks);
  };
  overlay.classList.remove('hidden');
  overlay.focus();
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', value?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function portrait(row: SettlementRow, images: Readonly<Record<string, string>>) {
  const frame = element('span', 'settlement-portrait');
  const url = row.generalId ? images[row.generalId] : undefined;
  if (url) {
    const image = element('img'); image.src = url; image.alt = row.general; frame.append(image);
  } else frame.textContent = row.general.slice(0, 1);
  return frame;
}

function renderMvp(rows: SettlementRow[], score: BattleScore | null, images: Readonly<Record<string, string>>) {
  const box = document.getElementById('settlement-mvp')!;
  box.classList.toggle('no-mvp', !score);
  if (!score) { box.replaceChildren(element('span', 'settlement-mvp-label', '本 局 荣 誉'), element('strong', '', '平局 · 不评 MVP')); return; }
  const row = rows.find(row => row.seat === score.seat + 1)!;
  const info = element('div', 'settlement-mvp-info');
  info.append(element('span', 'settlement-mvp-label', '胜 方  M V P'),
    element('strong', '', row.general), element('span', 'settlement-mvp-meta', `座${row.seat}${row.self ? ' · 你' : ''}${row.role ? ` · ${row.role}` : ''}`),
    element('small', '', `对敌伤害 ${score.stat.enemyDamage} · 治疗贡献 ${score.stat.supportHealing} · 有效击杀 ${score.stat.effectiveKills}`));
  const points = element('div', 'settlement-mvp-points');
  points.append(element('b', '', String(score.total)), element('span', '', '本局贡献分'));
  box.replaceChildren(portrait(row, images), info, points);
}

function renderScoreboard(rows: SettlementRow[], awards: BattleAwards): void {
  const table = document.getElementById('settlement-scoreboard')!;
  const head = element('thead'), header = element('tr');
  for (const title of ['排名', '武将 / 身份', '对敌伤害', '治疗贡献', '有效击杀', '友伤 / 误杀扣分', '胜利加分', '贡献分']) {
    const cell = element('th', '', title); cell.scope = 'col'; header.append(cell);
  }
  head.append(header);
  const body = element('tbody');
  const max = Math.max(1, ...awards.scores.map(score => score.total));
  for (const score of awards.scores) {
    const row = rows.find(row => row.seat === score.seat + 1)!;
    const line = element('tr', `${score.mvp ? 'mvp ' : ''}${row.self ? 'self ' : ''}${row.winner ? 'winner' : ''}`);
    const rank = element('td'); rank.append(element('span', 'settlement-rank', String(score.rank)));
    const name = element('th', 'settlement-score-name', `座${row.seat} ${row.general}${row.role ? ` · ${row.role}` : ''}${row.self ? ' · 你' : ''}`);
    name.scope = 'row';
    if (score.mvp) name.append(element('span', 'settlement-inline-mvp', 'MVP'));
    line.append(rank, name);
    for (const [amount, points] of [[score.stat.enemyDamage, score.points.damage], [score.stat.supportHealing, score.points.healing], [score.stat.effectiveKills, score.points.kills]]) {
      const cell = element('td'); cell.append(element('b', '', String(amount)), element('small', '', `+${points} 分`)); line.append(cell);
    }
    const penalty = element('td', score.points.penalty ? 'settlement-penalty' : '', score.points.penalty ? `−${score.points.penalty}` : '—');
    penalty.title = `友伤 ${score.stat.friendlyDamage} 点，误杀 ${score.stat.friendlyKills} 人`;
    line.append(penalty, element('td', '', `+${score.points.victory}`));
    const total = element('td', 'settlement-total');
    total.append(element('b', '', String(score.total)));
    const meter = element('span', 'settlement-score-meter'); meter.style.setProperty('--score-width', `${score.total / max * 100}%`);
    total.append(meter); line.append(total); body.append(line);
  }
  table.replaceChildren(head, body);
}

function renderReport(rows: SettlementRow[], stats: BattleStat[]): void {
  const table = document.getElementById('settlement-report')!;
  const head = document.createElement('thead');
  const headings = ['武将 / 身份', ...rows.map(row => `伤害→座${row.seat}`), '伤害合计', '治疗', '有效击杀'];
  const header = document.createElement('tr');
  for (const heading of headings) {
    const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = heading; header.append(cell);
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
  const retry = document.getElementById('settlement-retry') as HTMLButtonElement;
  retry.disabled = true;
  retry.onclick = () => { void uploadGame(game); };
  status.textContent = '正在保存本局决策轨迹…';
  try {
    const headers = await playerClient.saveHeaders();
    const response = await fetch(appUrl('/api/web-games'), { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(game) });
    if (!response.ok) {
      const failure = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(failure?.error || `HTTP ${response.status}`);
    }
    const saved = await response.json() as { id: string; playerSaved?: boolean; earnedPoints?: number; totalPoints?: number; reward?: MatchReward | null };
    status.textContent = saved.playerSaved ? '本局战绩、积分与决策轨迹已保存' : '决策轨迹已保存';
    if (saved.playerSaved && typeof saved.earnedPoints === 'number' && typeof saved.totalPoints === 'number') {
      document.getElementById('settlement-earned-points')!.textContent = `+${saved.earnedPoints}`;
      if (saved.reward) document.getElementById('settlement-reward-detail')!.textContent = rewardDescription(saved.reward);
      else document.getElementById('settlement-reward-detail')!.textContent = '积分规则启用前保存的对局，重试不补发积分';
      document.getElementById('settlement-total-points')!.textContent = `累计积分 ${saved.totalPoints}`;
      if (playerClient.session) playerClient.updatePoints(saved.totalPoints);
    } else document.getElementById('settlement-total-points')!.textContent = '本局未绑定玩家，积分未入账';
    status.title = `轨迹编号：${saved.id}`;
    retry.classList.add('hidden');
  } catch (error) {
    status.textContent = '自动保存失败，请点击下载轨迹留存';
    status.title = error instanceof Error ? error.message : '';
    document.getElementById('settlement-total-points')!.textContent = '积分尚未保存，重试成功后入账';
    const download = document.getElementById('settlement-download') as HTMLButtonElement;
    download.classList.remove('hidden');
    retry.classList.remove('hidden');
  } finally {
    retry.disabled = false;
  }
  (document.getElementById('settlement-download') as HTMLButtonElement).onclick = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: 'application/json' }));
    link.download = `sanguosha-web-${game.config.seed}-${game.finishedAt.replaceAll(':', '-')}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
}

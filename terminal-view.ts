import { ChineseView } from "./chinese-view.ts";
import type { Choice, Observation } from "./contracts.ts";

const COLORS = {
  opponent: 124,
  player: 117,
  life: 196,
  club: 34,
  spade: 33,
  diamond: 196,
  heart: 213,
} as const;

function displayWidth(character: string): number {
  return /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(character) ? 2 : 1;
}

function fitLine(value: string, columns: number): string {
  const limit = Math.max(1, columns - 1);
  let line = "";
  let used = 0;
  for (const character of value) {
    const next = displayWidth(character);
    if (used + next > limit) return line.slice(0, -1) + "…";
    line += character;
    used += next;
  }
  return line;
}

/** 颜色只用于终端输出；规则观察值和完整轨迹保持纯文本。 */
export function colorizeTerminal(value: string, enabled: boolean): string {
  if (!enabled) return value;
  return value.replace(/[♥♡]+\s+\d+\/\d+|电脑|你|♣|♠|♦|♥/gu, token => {
    const color = token === "电脑" ? COLORS.opponent
      : token === "你" ? COLORS.player
      : token === "♣" ? COLORS.club
      : token === "♠" ? COLORS.spade
      : token === "♦" ? COLORS.diamond
      : token === "♥" ? COLORS.heart
      : COLORS.life;
    return `\x1b[38;5;${color}m${token}\x1b[0m`;
  });
}

export interface TerminalScreen {
  text: string;
  page: number;
  pageCount: number;
  visibleOptions: Choice[];
}

export class TerminalView {
  private readonly view: ChineseView;
  constructor(view = new ChineseView()) { this.view = view; }

  render(observation: Observation, rows: number, title?: string,
    options: Choice[] = [], requestedPage = 0, message = "", columns = 80): TerminalScreen {
    const board = this.view.board(observation);
    const boardHeight = board.split("\n").length;
    const height = Number.isFinite(rows) ? rows : 40;
    if (columns < 76 || height < boardHeight + 5) {
      return {
        text: `终端窗口过小，请将窗口至少调整到 76 列、${boardHeight + 5} 行。`,
        page: 0, pageCount: 1, visibleOptions: [],
      };
    }

    const interactive = title !== undefined;
    const lines = [board, "最近事件："];
    if (interactive) {
      // 预留场面、标题、翻页提示和输入行；选项多时自动分页。
      const space = height - boardHeight - 4 - (message ? 1 : 0);
      const eventCount = Math.min(8, Math.max(0, space - Math.min(options.length, 4)));
      const pageSize = Math.max(1, space - eventCount);
      const pageCount = Math.max(1, Math.ceil(options.length / pageSize));
      const page = Math.max(0, Math.min(requestedPage, pageCount - 1));
      const visibleOptions = options.slice(page * pageSize, (page + 1) * pageSize);
      const events = eventCount ? observation.log.slice(-eventCount) : [];
      lines.push(...events.map(event => fitLine(`  • ${event}`, columns)));
      lines.push(fitLine(title, columns));
      lines.push(...visibleOptions.map((option, index) =>
        fitLine(`  ${index + 1}. ${option.label}`, columns)));
      lines.push(fitLine(`第 ${page + 1}/${pageCount} 页 · 数字选择 · n/p 翻页 · b 返回 · q 退出`, columns));
      if (message) lines.push(fitLine(message, columns));
      return { text: lines.join("\n"), page, pageCount, visibleOptions };
    }

    const eventCount = Math.min(8, Math.max(0, height - boardHeight - 3));
    lines.push(...(eventCount ? observation.log.slice(-eventCount) : [])
      .map(event => fitLine(`  • ${event}`, columns)));
    return { text: lines.join("\n"), page: 0, pageCount: 1, visibleOptions: [] };
  }
}

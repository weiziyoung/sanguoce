#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { outcomeLabel } from "./src/presentation/outcome-label.ts";
import type { GameOutcome, Transition } from "./contracts.ts";

interface SavedFrame {
  transition: Transition;
  state: { turn: number; players: { label: string }[] };
  newEvents: string[];
}
interface SavedTrace {
  format: string;
  complete: boolean;
  config: { seed?: number };
  frames: SavedFrame[];
  finalState: { outcome: GameOutcome | number | "draw" | null; turn: number; players: { label: string }[] } | null;
}

/** 按原始顺序展示选择与全知调试事件；报告和 JSON 均可能含隐藏信息。 */
export function renderTraceReport(input: unknown): string {
  if (!input || typeof input !== "object" ||
      !('format' in input) || !["sanguosha-cli.full-trace.v1", "sanguosha-cli.full-trace.v2", "sanguosha-cli.full-trace.v3", "sanguosha-cli.full-trace.v4"].includes(String(input.format))) {
    throw new Error("不是可识别的三国杀轨迹文件");
  }
  const trace = input as SavedTrace;
  const choices = trace.frames.filter(frame => frame.transition.type === "choice").length;
  const tasks = trace.frames.filter(frame => frame.transition.type === "task").length;
  const outcome = trace.finalState?.outcome;
  const winner = outcome === null || outcome === undefined ? "未结束" :
    typeof outcome === 'object' ? outcomeLabel(outcome, trace.finalState!.players.map((p, id) => ({ ...p, id }))) :
    outcome === "draw" ? "平局" : `${trace.finalState!.players[outcome].label}获胜`;
  const lines = [
    "# 三国杀单局流程",
    "",
    `随机种子：${trace.config.seed ?? "未记录"}。结果：${winner}。`,
    `共 ${trace.finalState?.turn ?? 0} 回合、${choices} 次选择、${tasks} 项自动结算、${trace.frames.length} 个状态。`,
  ];
  let currentTurn = -1;
  let choiceNumber = 0;
  for (const frame of trace.frames) {
    if (frame.state.turn !== currentTurn) {
      currentTurn = frame.state.turn;
      lines.push("", `## 第 ${currentTurn} 回合`, "");
    }
    if (frame.transition.type === "choice") {
      choiceNumber++;
      const actor = frame.state.players[frame.transition.actor]?.label ?? "未知角色";
      lines.push(`- 决策 ${choiceNumber}：${actor}选择「${frame.transition.choiceLabel}」`);
    }
    for (const event of frame.newEvents) lines.push(`- ${event}`);
  }
  return lines.join("\n") + "\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const source = process.argv[2];
  if (!source) {
    console.error("用法：node trace-report.ts 轨迹.json [流程.md]");
    process.exit(2);
  }
  const report = renderTraceReport(JSON.parse(readFileSync(resolve(source), "utf8")));
  const target = process.argv[3];
  if (target) {
    const path = resolve(target);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, report, "utf8");
    console.log(`流程报告已写入：${path}`);
  } else process.stdout.write(report);
}

#!/usr/bin/env node
import { GENERAL_PACKS, generalPackLabel, contentForCards, type GeneralPack, type CardSet } from './src/app/game-content.ts';
import readline from "node:readline/promises";
import { randomInt } from "node:crypto";
import { stdin, stdout } from "node:process";
import { resolve } from "node:path";
import { GameEngine, type GameState } from "./engine.ts";
import { ChineseView, roleLabel } from "./chinese-view.ts";
import { colorizeTerminal, TerminalView } from "./terminal-view.ts";
import { StrategicPolicy } from "./src/policies/strategic-policy.ts";
import { JevPolicy } from "./src/policies/jev-policy.ts";
import { LayaPolicy } from "./src/policies/laya-policy.ts";
import { GameTrace } from "./trace.ts";
import { outcomeLabel } from "./src/presentation/outcome-label.ts";
import { DuelGeneralSelector, type GeneralCandidate } from "./src/app/duel-general-selector.ts";
import { IdentityGeneralSelector } from './src/app/identity-general-selector.ts';
import { IdentityPregame } from "./src/app/identity-pregame.ts";
import { renderGeneralSelection } from "./src/presentation/general-selection-view.ts";
import { GAME_NAME } from "./src/presentation/brand.ts";
import type { Choice, Decision, GameConfig } from "./contracts.ts";
import { forcedActionId } from "./src/domain/forced-choice.ts";

const args = process.argv.slice(2);
const cardsPosition = args.indexOf('--cards');
const requestedCards = cardsPosition >= 0 ? args[cardsPosition + 1] : 'standard';
if (!['standard', 'junzheng'].includes(requestedCards ?? '')) { console.error('请在 --cards 后指定 standard 或 junzheng'); process.exit(2); }
const cards = requestedCards as CardSet;
const generalsPosition = args.indexOf('--generals');
const requestedGenerals = generalsPosition >= 0 ? args[generalsPosition + 1] : 'standard';
const names = requestedGenerals === 'standard' ? [] : requestedGenerals?.split(',');
if (!names || names.some(pack => !GENERAL_PACKS.includes(pack as GeneralPack)) || new Set(names).size !== names.length) { console.error('请在 --generals 后指定 standard、wind、fire 或 wind,fire'); process.exit(2); }
const generalPacks: GeneralPack[] = GENERAL_PACKS.filter(pack => names.includes(pack));
const content = contentForCards(cards, generalPacks);
const selector = new DuelGeneralSelector(content.generals(), content);
const demo = args.includes("--demo");
const modePosition = args.indexOf('--mode');
const requestedMode = modePosition >= 0 ? args[modePosition + 1] : undefined;
const seedPosition = args.indexOf("--seed");
const seed = seedPosition >= 0 ? Number(args[seedPosition + 1]) : randomInt(0, 0x100000000);
const dumpPosition = args.indexOf("--dump");
const dumpPath = dumpPosition >= 0 ? args[dumpPosition + 1] : null;
const aiPosition = args.indexOf('--ai');
const requestedAi = aiPosition >= 0 ? args[aiPosition + 1] : 'rule';
if (!Number.isInteger(seed)) {
  console.error("随机种子必须为整数");
  process.exit(2);
}
if (dumpPosition >= 0 && (!dumpPath || dumpPath.startsWith("--"))) {
  console.error("请在 --dump 后指定轨迹 JSON 文件路径");
  process.exit(2);
}
if (modePosition >= 0 && !['duel', 'identity'].includes(requestedMode ?? '')) {
  console.error('请在 --mode 后指定 duel 或 identity');
  process.exit(2);
}
if (!['rule', 'jev', 'laya'].includes(requestedAi ?? '')) {
  console.error('请在 --ai 后指定 rule、jev 或 laya');
  process.exit(2);
}
const rl = demo ? null : readline.createInterface({ input: stdin, output: stdout });
const input = rl?.[Symbol.asyncIterator]();
const view = new ChineseView();
const terminal = new TerminalView(view);
const policy = requestedAi === 'jev' ? new JevPolicy() :
  requestedAi === 'laya' ? new LayaPolicy() : new StrategicPolicy(undefined, content.deck);
const aiLabel = requestedAi === 'jev' ? 'Jev' : requestedAi === 'laya' ? 'Laya' : '规则策略';
let steps = 0;
let trace: GameTrace<GameState> | null = null;
let humanSeat = 0;
const useColor = Boolean(stdout.isTTY && !args.includes("--no-color"));
const screenRows = () => stdout.rows || 24;
let openingSummary = '';

async function readInput(): Promise<string | null> {
  stdout.write('> ');
  const next = await input!.next();
  return next.done ? null : next.value.trim();
}

function writeScreen(content: string): void {
  if (stdout.isTTY && !demo) stdout.write("\x1b[2J\x1b[H");
  stdout.write(colorizeTerminal(content, useColor) + "\n");
}

function renderFinal(game: GameEngine<GameState>): void {
  const observation = game.getObservation(humanSeat);
  writeScreen(terminal.render(observation, screenRows(), undefined, [], 0, "", stdout.columns || 80).text);
}

async function selectMode(): Promise<'duel' | 'identity' | null> {
  if (requestedMode) return requestedMode as 'duel' | 'identity';
  if (demo) return 'duel';
  let message = '';
  while (true) {
    writeScreen(`${GAME_NAME} · 选择模式 · 随机种子 ${seed}\n  1. 1v1 对决\n  2. 标准五人身份局（1主公、1忠臣、2反贼、1内奸）\n输入 1 或 2；输入 q 退出。${message ? `\n${message}` : ''}`);
    const response = await readInput();
    if (response === null || response === 'q' || response === '退出') return null;
    if (response === '1') return 'duel';
    if (response === '2') return 'identity';
    message = '请输入 1 或 2，或输入 q 退出。';
  }
}

async function selectGeneral(candidates: readonly GeneralCandidate[], identity?: { role: string; lord: string }): Promise<GeneralCandidate | null> {
  let message = '';
  while (true) {
    writeScreen(renderGeneralSelection(candidates, seed, message, identity));
    const response = await readInput();
    if (response === null || response === 'q' || response === '退出') return null;
    const index = Number(response) - 1;
    if (Number.isInteger(index) && index >= 0 && index < candidates.length) return candidates[index];
    message = `请输入 1 至 ${candidates.length}，或输入 q 退出。`;
  }
}

async function askChoice(game: GameEngine<GameState>, title: string, options: Choice[], canBack: boolean): Promise<Choice | "back" | null> {
  let page = 0;
  let message = "";
  while (true) {
    const screen = terminal.render(game.getObservation(humanSeat), screenRows() - (openingSummary ? 2 : 0), title, options,
      page, message, stdout.columns || 80);
    page = screen.page;
    writeScreen((openingSummary ? `${openingSummary}\n` : '') + screen.text);
    openingSummary = '';
    const response = await readInput();
    if (response === null || response === "q" || response === "退出") return null;
    if (response === "b") {
      if (canBack) return "back";
      message = "当前已是第一层选项。";
      continue;
    }
    if (response === "n" || response === "p") {
      const next = page + (response === "n" ? 1 : -1);
      if (next >= 0 && next < screen.pageCount) {
        page = next;
        message = "";
      } else message = "已经是最后一页或第一页。";
      continue;
    }
    const index = Number(response) - 1;
    if (Number.isInteger(index) && index >= 0 && index < screen.visibleOptions.length) {
      return screen.visibleOptions[index];
    }
    message = "请输入当前页的选项序号，或输入 q 退出。";
  }
}
async function humanChoice(game: GameEngine<GameState>, decision: Decision): Promise<string | null> {
  const path: Choice[] = [];
  let options = decision.options;
  while (true) {
    const title = path.length
      ? `${decision.title} › ${path.map(choice => choice.label).join(" › ")}`
      : decision.title;
    const chosen = await askChoice(game, title, options, path.length > 0);
    if (!chosen) return null;
    if (chosen === "back") {
      path.pop();
      options = path.length ? path.at(-1)!.children! : decision.options;
      continue;
    }
    if (!chosen.children) return chosen.id;
    path.push(chosen);
    options = chosen.children;
  }
}

try {
  const mode = await selectMode();
  if (mode) {
    let chosen: GeneralCandidate | null;
    let config: GameConfig | null = null;
    let summary = '';
    if (mode === 'identity') {
      const pregame = new IdentityPregame(seed, new IdentityGeneralSelector(selector));
      humanSeat = pregame.humanSeat;
      const identity = { role: roleLabel(pregame.role), lord: `座${pregame.lordSeat + 1}` };
      chosen = demo ? pregame.offer.computerPicks[humanSeat] : await selectGeneral(pregame.candidates, identity);
      if (!chosen) {
        stdout.write('已退出选将。\n');
      } else {
        const generals = pregame.generals(chosen);
        config = { mode, seed, players: generals.map((general, id) => ({
          label: `${id === humanSeat ? '你' : `电脑${id + 1}`}（${general.label}）`, sex: general.sex, general: general.id,
        })) };
        summary = `你在座${humanSeat + 1}，身份：【${identity.role}】；主公在${identity.lord}；你选择【${chosen.label}】\n` +
          generals.flatMap((general, id) => id === humanSeat ? [] : [`座${id + 1}电脑选中【${general.label}】`]).join('；');
      }
    } else {
      const offer = selector.offer(seed);
      chosen = demo ? offer.demoPick : await selectGeneral(offer.player);
      if (!chosen) {
        stdout.write('已退出选将。\n');
      } else {
        const opponent = offer.computerPick;
        config = { seed, players: [
          { label: `你（${chosen.label}）`, sex: chosen.sex, general: chosen.id },
          { label: `电脑（${opponent.label}）`, sex: opponent.sex, general: opponent.id },
        ] };
        summary = `我方候选：${offer.player.map(item => item.label).join('、')}；选择【${chosen.label}】\n` +
          `电脑候选：${offer.computer.map(item => item.label).join('、')}；随机选中【${opponent.label}】`;
      }
    }
    if (chosen && config) {
      config.cards = cards;
      if (generalPacks.length) config.generalPacks = generalPacks;
      trace = dumpPath ? new GameTrace<GameState>(config, {
        我方: demo ? aiLabel : "人工决策",
        对手: aiLabel,
      }) : null;
      const game = GameEngine.standard(config, trace);
      if (demo) stdout.write(`${GAME_NAME} ${mode === 'identity' ? '标准五人身份局' : '1v1'} · ${cards === 'junzheng' ? '标准＋军争牌包' : '标准牌包'}${generalPacks.length ? ' · ' + generalPackLabel(generalPacks) : ''} · 随机种子 ${seed}\n${summary}\n`);
      else openingSummary = summary;
      while (!game.finished && steps < 5000) {
        const current = game.getDecision();
        if (!current) break;
        const before = game.getObservation(current.actor);
        const choiceId = forcedActionId(current) ?? (demo || current.actor !== humanSeat
          ? await policy.choose(before, current)
          : await humanChoice(game, current));
        if (!choiceId) break;
        if (!game.getLegalActions().some(option => option.id === choiceId)) {
          throw new Error("策略返回非法行动");
        }
        if (demo) {
          const selected = game.getLegalActions().find(option => option.id === choiceId)!;
          stdout.write(colorizeTerminal(
            `[${String(steps + 1).padStart(3)}] ${before.self.label}：${selected.label}\n`, useColor));
        }
        game.choose({ decisionId: current.id!, optionId: choiceId });
        steps++;
      }
      renderFinal(game);
      const finalView = game.getObservation(humanSeat);
      const result = finalView.outcome;
      if (result.status !== "ongoing") {
        stdout.write(colorizeTerminal(
          `\n结果：${outcomeLabel(result, [finalView.self, ...finalView.others])}；共 ${steps} 次决策。\n`, useColor));
      } else stdout.write(`\n对局已退出；共 ${steps} 次决策。\n`);
    }
  } else {
    stdout.write('已退出模式选择。\n');
  }
} finally {
  rl?.close();
  if (trace && dumpPath) {
    const location = resolve(dumpPath);
    trace.write(location);
    stdout.write(`完整状态轨迹已写入：${location}（${trace.frames.length} 个状态）\n`);
  }
}

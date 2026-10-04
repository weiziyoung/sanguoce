import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { GameEngine } from "../engine.ts";
import { colorizeTerminal, TerminalView } from "../terminal-view.ts";

test("终端颜色区分玩家、体力与四种花色，纯文本保持不变", () => {
  const plain = "电脑 你 ♥♡ 1/4 【杀】♣7 【闪】♠2 【桃】♦3 【杀】♥9";
  const colored = colorizeTerminal(plain, true);
  assert.equal(stripVTControlCharacters(colored), plain);
  assert.match(colored, /\x1b\[38;5;124m电脑/);
  assert.match(colored, /\x1b\[38;5;117m你/);
  assert.match(colored, /\x1b\[38;5;196m♥♡ 1\/4/);
  assert.match(colored, /\x1b\[38;5;34m♣/);
  assert.match(colored, /\x1b\[38;5;33m♠/);
  assert.match(colored, /\x1b\[38;5;196m♦/);
  assert.match(colored, /\x1b\[38;5;213m♥\x1b\[0m9/);
  assert.equal(colorizeTerminal(plain, false), plain);
});

test("固定屏幕内事件逐行显示，选项过多时分页", () => {
  const game = GameEngine.standard({ seed: 7 });
  const observation = game.getObservation(0);
  observation.log = Array.from({ length: 10 }, (_, index) => `事件${index + 1}`);
  const options = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), label: `选择${index + 1}`,
  }));
  const terminal = new TerminalView();
  const first = terminal.render(observation, 24, "请选择行动", options);
  const second = terminal.render(observation, 24, "请选择行动", options, 1);
  assert.ok(first.pageCount > 1);
  assert.ok(first.text.split("\n").length <= 23);
  assert.match(first.text, /最近事件：\n  • 事件\d+\n  • 事件\d+/);
  assert.notEqual(first.visibleOptions[0].id, second.visibleOptions[0].id);
  assert.equal(first.text.includes("事件1；事件2"), false);
});

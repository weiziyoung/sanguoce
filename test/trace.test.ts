import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameEngine, type GameState } from "../engine.ts";
import { RuleBasePolicy } from "../policy.ts";
import { GameTrace } from "../trace.ts";

test("单局完整状态轨迹记录建局、全部选择及自动结算，能够精确复现", () => {
  const config = { seed: 7 };
  const firstTrace = new GameTrace<GameState>(config);
  const first = GameEngine.standard(config, firstTrace);
  const policy = new RuleBasePolicy();
  const initialFrames = firstTrace.frames.length;
  assert.throws(() => first.choose("不存在的行动"));
  assert.equal(firstTrace.frames.length, initialFrames);
  let choices = 0;
  while (!first.finished && choices < 2000) {
    const current = first.getDecision()!;
    first.choose(policy.choose(first.getObservation(current.actor), current));
    choices++;
  }
  assert.ok(first.finished);
  assert.equal(firstTrace.frames[0].transition.type, "setup");
  assert.equal(firstTrace.frames.filter(frame => frame.transition.type === "choice").length, choices);
  assert.ok(firstTrace.frames.some(frame => frame.transition.type === "task"));
  assert.equal(Object.keys(firstTrace.frames[0].state.cards).length, 108);
  assert.deepEqual(firstTrace.frames.at(-1)?.state.outcome, first.getObservation(0).outcome);
  assert.ok(firstTrace.frames.at(-1)?.state.events.length);

  const replayTrace = new GameTrace<GameState>(config);
  const replay = GameEngine.standard(config, replayTrace);
  for (const frame of firstTrace.frames) {
    if (frame.transition.type === "choice") replay.choose(frame.transition.choiceId);
  }
  assert.deepEqual(replayTrace.document(), firstTrace.document());
  const withoutTrace = GameEngine.standard(config);
  for (const frame of firstTrace.frames) {
    if (frame.transition.type === "choice") withoutTrace.choose(frame.transition.choiceId);
  }
  assert.deepEqual(withoutTrace.getObservation(0), first.getObservation(0));

  const folder = mkdtempSync(join(tmpdir(), "sanguosha-trace-"));
  try {
    const path = join(folder, "game.json");
    firstTrace.write(path);
    const stored = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(stored.format, "sanguosha-cli.full-trace.v4");
    assert.equal(stored.complete, true);
    assert.equal(stored.frames.length, firstTrace.frames.length);
    assert.deepEqual(stored.finalState, firstTrace.document().finalState);
    assert.doesNotMatch(JSON.stringify(stored), /:\s*"(sha|shan|tao|wuxie|jiedao)"/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

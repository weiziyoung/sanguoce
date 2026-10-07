import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { name, nextAlive, person } from "../../../domain/state-access.ts";
import type { TaskOf } from "../../../domain/state.ts";
import { type GameState } from "../../../domain/state.ts";
import { cardMovement } from "../../../rules/operations/card-movement-service.ts";
import { discardOwned } from "../../../rules/operations/cards.ts";
import { damage } from "./damage-flow.ts";
import { beginNullify } from "./nullification-flow.ts";
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';

export function moveLightning(s: GameState, owner: number, cid: number): void {
  let next = nextAlive(s, owner);
  while (next !== owner && person(s, next).judge.some(id => name(s, id) === "shandian")) {
    next = nextAlive(s, next);
  }
  if (next === owner) {
    cardMovement.move(s, [cid], { kind: "discard" }, owner);
    emitEvent(s, 'lightningMoved', { target: null });
  } else {
    cardMovement.move(s, [cid], { kind: "judge", owner: next }, owner);
    emitEvent(s, 'lightningMoved', { target: next });
  }
}

export function cancelJudge(s: GameState, owner: number, cid: number): void {
  if (!person(s, owner).judge.includes(cid)) return;
  const cname = name(s, cid);
  if (cname === "shandian") moveLightning(s, owner, cid);
  else discardOwned(s, owner, cid);
}

export function applyDelayedJudgement(s: GameState, owner: number, cid: number, finalId: number | null, runtime: ContentRuntime = getStandardRuntime()): void {
  if (!person(s, owner).judge.includes(cid)) return;
  const cname = name(s, cid);
  const definition = runtime.content.card(cname);
  if (definition.delayedEffect) { definition.delayedEffect(s, owner, cid, finalId, runtime); return; }
  const result = finalId === null ? null : s.cards[finalId];
  if (cname === "lebu") {
    discardOwned(s, owner, cid);
    if (!result || runtime.queries.suit(s, owner, result) !== "heart") {
      s.skipPlay = true;
      emitEvent(s, 'playSkipped', { player: owner, announced: true });
    }
  } else if (cname === "shandian") {
    if (result && runtime.queries.suit(s, owner, result) === "spade" && result.rank >= 2 && result.rank <= 9) {
      discardOwned(s, owner, cid);
      damage(s, owner, null, 3, null, cid, { nature: 'thunder' });
    } else {
      moveLightning(s, owner, cid);
    }
  }
}

export function handleJudgeCardTask(s: GameState, task: TaskOf<"judgeCard">): void {
  if (person(s, task.owner).judge.includes(task.cid)) {
    beginNullify(s,
      { kind: "resolveJudge", owner: task.owner, cid: task.cid },
      { kind: "cancelJudge", owner: task.owner, cid: task.cid },
      task.owner, task.owner, name(s, task.cid));
  }

}

export function handleResolveJudgeTask(s: GameState, task: TaskOf<"resolveJudge">,
  runtime: ContentRuntime = getStandardRuntime()): void {
  if (person(s, task.owner).judge.includes(task.cid)) {
    new JudgementFlow(runtime).begin(s, task.owner, name(s, task.cid),
      { kind: 'applyDelayedJudgement', owner: task.owner, cid: task.cid });
  }
}

export function handleCancelJudgeTask(s: GameState, task: TaskOf<"cancelJudge">): void {
  cancelJudge(s, task.owner, task.cid);
}

export function handleApplyDelayedJudgementTask(s: GameState, task: TaskOf<'applyDelayedJudgement'>, runtime: ContentRuntime = getStandardRuntime()): void {
  const frame = resolutionStack.require(s, 'judgement');
  if (frame.data.owner !== task.owner || frame.data.reason !== name(s, task.cid)) throw new Error('判定结果与延时牌不匹配');
  applyDelayedJudgement(s, task.owner, task.cid, frame.data.finalId, runtime);
}

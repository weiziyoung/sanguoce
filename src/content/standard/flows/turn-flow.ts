import { emitEvent } from '../../../domain/event-journal.ts';
import { cardText } from "../../../../catalog.ts";
import { leaf, setPrompt } from "../../../core/decision-manager.ts";
import { card, nextAlive, person, push } from "../../../domain/state-access.ts";
import type { ActionMap, PromptOf, TaskOf } from "../../../domain/state.ts";
import { type GameState } from "../../../domain/state.ts";
import { discardOwned, draw } from "../../../rules/operations/cards.ts";
import { playOptions } from "../action-generator.ts";
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { getStandardRuntime } from '../runtime.ts';
import { clearWine } from '../../../rules/operations/wine-state.ts';

export function startTurn(s: GameState): void {
  if (person(s, s.active).faceDown) {
    person(s, s.active).faceDown = false;
    emitEvent(s, 'turnedOver', { player: s.active, faceDown: false });
    emitEvent(s, 'turnSkipped', { player: s.active });
    push(s, { kind: 'phaseEndAdvance' });
    return;
  }
  s.turn++;
  s.shaUsed = 0;
  if (s.jiuUsed !== undefined) s.jiuUsed = 0;
  for (const player of s.players) clearWine(s, player.id, 'turnEnd');
  delete s.shaPlayedOrRespondedInPlay;
  if (s.turnMarks) s.turnMarks = [];
  if (s.skillProgress) s.skillProgress = [];
  emitEvent(s, 'turnStarted', { player: s.active, turn: s.turn });
  push(s,
    { kind: "phaseStart" }, { kind: "phaseBefore", phase: "judge" }, { kind: "phaseJudge" }, { kind: "phaseDraw" },
    { kind: "phaseBefore", phase: "play" }, { kind: "phasePlay" }, { kind: "phaseDiscard" }, { kind: "phaseEnd" },
  );
}

export function handlePhaseStartTask(s: GameState, task: TaskOf<"phaseStart">,
  runtime: ContentRuntime = getStandardRuntime()): void {
  if (!person(s, s.active).alive) return;
  s.phase = "start";
  s.skipPlay = false;
  if (s.skipJudge !== undefined) s.skipJudge = false;
  if (s.skipDraw !== undefined) s.skipDraw = false;
  push(s, ...runtime.abilities.list(s, s.active).filter(skill => skill.startPhase)
    .map(skill => ({ kind: 'phaseStartOffer' as const, ability: skill.id, owner: s.active })));

}

export function handlePhaseJudgeTask(s: GameState, task: TaskOf<"phaseJudge">): void {
  if (!person(s, s.active).alive) return;

  s.phase = "judge";
  if (s.skipJudge) { emitEvent(s, 'judgementSkipped', { player: s.active }); return; }
  const cards = [...person(s, s.active).judge];
  push(s, ...cards.map(cid => ({ kind: "judgeCard" as const, owner: s.active, cid })));

}

export function handlePhaseDrawTask(s: GameState, task: TaskOf<"phaseDraw">,
  runtime: ContentRuntime = getStandardRuntime()): void {
  if (!person(s, s.active).alive) return;
  s.phase = "draw";
  if (s.skipDraw) { emitEvent(s, 'drawSkipped', { player: s.active }); return; }
  const skills = runtime.abilities.list(s, s.active);
  const automatic = skills.find(skill => skill.drawPhase?.optional === false);
  if (automatic) {
    const choices = automatic.drawPhase!.options(s, s.active);
    if (choices.length !== 1) throw new Error('自动摸牌技能必须提供唯一结算选项');
    resolveDrawSkill(s, s.active, automatic.id, choices[0].id, runtime);
    return;
  }
  const options = skills.flatMap(skill =>
    skill.drawPhase?.options(s, s.active).map(option => leaf(`draw-skill:${skill.id}:${option.id}`,
      `【${skill.label ?? skill.id}】${option.label}`,
      { type: 'skill' as const, ability: skill.id, choice: option.id, targets: [...option.targets] })) ?? []);
  if (options.length) {
    setPrompt(s, s.active, 'phaseDrawChoice', '摸牌阶段：选择正常摸牌或发动技能', [
      leaf('draw-normal', '正常摸两张牌', { type: 'normal' }), ...options,
    ]);
  } else draw(s, s.active, 2);

}

export function handlePhaseDrawChoice(s: GameState, prompt: PromptOf<'phaseDrawChoice'>,
  action: ActionMap['phaseDrawChoice'], runtime: ContentRuntime = getStandardRuntime()): void {
  if (action.type === 'normal') { draw(s, prompt.actor, 2); return; }
  resolveDrawSkill(s, prompt.actor, action.ability, action.choice, runtime);
}

function resolveDrawSkill(s: GameState, owner: number, ability: string, choice: string,
  runtime: ContentRuntime): void {
  const skill = runtime.abilities.list(s, owner).find(item => item.id === ability);
  const option = skill?.drawPhase?.options(s, owner).find(item => item.id === choice);
  if (!skill || !option) throw new Error('摸牌阶段技能已失效');
  emitEvent(s, 'skillActivated', { ability: skill.id, label: skill.label ?? skill.id,
    owner, targets: [...option.targets] });
  skill.drawPhase!.execute(s, owner, option.targets, runtime);
}

export function handlePhasePlayTask(s: GameState, task: TaskOf<"phasePlay">, runtime: ContentRuntime = getStandardRuntime()): void {
  if (!person(s, s.active).alive) return;
  s.phase = "play";
  if (s.shaPlayedOrRespondedInPlay === undefined &&
    runtime.abilities.list(s, s.active).some(skill => skill.modifier?.skipDiscard)) {
    s.shaPlayedOrRespondedInPlay = false;
  }
  if (s.skipPlay) {
    emitEvent(s, 'playSkipped', { player: s.active, announced: false });
  } else {
    setPrompt(s, s.active, "play", "出牌阶段：选择行动", playOptions(s, runtime));
  }

}

export function handlePhaseDiscardTask(s: GameState, task: TaskOf<"phaseDiscard">, runtime: ContentRuntime = getStandardRuntime()): void {
  if (!person(s, s.active).alive) return;
  s.phase = "discard";
  const skill = runtime.abilities.list(s, s.active).find(skill => skill.modifier?.skipDiscard?.(s, s.active));
  if (skill && person(s, s.active).hand.length > runtime.queries.handLimit(s, s.active)) {
    setPrompt(s, s.active, 'phaseDiscardChoice', `是否发动【${skill.label ?? skill.id}】跳过弃牌阶段？`, [
      leaf(`skip-discard:${skill.id}`, '跳过弃牌阶段', { type: 'skip' }),
      leaf(`continue-discard:${skill.id}`, '正常弃牌', { type: 'continue' }),
    ], { ability: skill.id, label: skill.label ?? skill.id });
    return;
  }
  handlePhaseDiscardNormalTask(s, runtime);
}

export function handlePhaseDiscardNormalTask(s: GameState, runtime: ContentRuntime = getStandardRuntime()): void {
  if (!person(s, s.active).alive) return;
  const required = person(s, s.active).hand.length - runtime.queries.handLimit(s, s.active);
  if (required > 0) {
    const options = person(s, s.active).hand.map(cid =>
      leaf(`discard:${cid}`, `弃置${cardText(card(s, cid))}`, { type: "discard", cid }));
    setPrompt(s, s.active, "discard", `弃牌至体力上限（还需弃${required}张）`, options, { required });
  }

}

export function handlePhaseDiscardChoice(s: GameState, prompt: PromptOf<'phaseDiscardChoice'>,
  action: ActionMap['phaseDiscardChoice']): void {
  if (action.type === 'skip') {
    emitEvent(s, 'skillActivated', { ability: prompt.context.ability, label: prompt.context.label,
      owner: prompt.actor, targets: [] });
  } else push(s, { kind: 'phaseDiscardNormal' });
}

export function handlePhaseEndTask(s: GameState, task: TaskOf<"phaseEnd">,
  runtime: ContentRuntime = getStandardRuntime()): void {
  s.phase = "end";
  if (!person(s, s.active).alive) { handlePhaseEndAdvanceTask(s); return; }
  push(s, ...runtime.abilities.list(s, s.active).filter(skill => skill.endPhase)
    .map(skill => ({ kind: 'phaseEndOffer' as const, ability: skill.id, owner: s.active })),
  { kind: 'phaseEndAdvance' });
}

export function handlePhaseEndAdvanceTask(s: GameState): void {
  clearWine(s, s.active, 'turnEnd');
  s.active = nextAlive(s, s.active);
  startTurn(s);
}

export function handleDiscardChoice(s: GameState, prompt: PromptOf<"discard">, data: ActionMap["discard"]): void {
  const actor = prompt.actor;
  discardOwned(s, actor, data.cid);
  push(s, { kind: "phaseDiscard" });

}

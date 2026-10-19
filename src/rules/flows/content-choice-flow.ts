import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, ContentChoiceContext, GameState, PromptOf } from '../../domain/state.ts';
import type { ContentRuntime } from '../content-runtime.ts';

/** Resumable choices declared by content, with costs and targets exposed to UI and AI. */
export function openContentChoice(state: GameState, owner: number, ability: string, context: ContentChoiceContext): void {
  resolutionStack.open(state, 'contentChoice', { owner, ability, context }, [{ kind: 'contentChoiceOffer' }]);
}
export function offerContentChoice(state: GameState, runtime: ContentRuntime): void {
  const { owner, ability, context } = resolutionStack.require(state, 'contentChoice').data;
  const skill = runtime.content.requireSkill(ability);
  if (skill.choice?.ownerRequired !== false && (!state.players[owner].alive || !runtime.abilities.has(state, owner, ability))) return;
  const actor = skill.choice?.actor?.(state, owner, context) ?? owner;
  if (!state.players[actor]?.alive) return;
  const options = skill.choice?.options(state, owner, context, runtime) ?? [];
  if (!options.length) return;
  setPrompt(state, actor, 'contentChoice', `【${skill.label ?? ability}】：选择行动`, options.map(option =>
    leaf(`content:${ability}:${option.id}`, option.label, { type: option.pass ? 'pass' : 'choose',
      choice: option.id, ...(option.zone ? { zone: option.zone, slot: option.slot } : {}), ids: [...(option.ids ?? [])], targets: [...(option.targets ?? [])] })),
  { ability, owner, ...context });
}
export function chooseContent(state: GameState, prompt: PromptOf<'contentChoice'>,
  action: ActionMap['contentChoice'], runtime: ContentRuntime): void {
  const { owner, ability, context } = resolutionStack.require(state, 'contentChoice').data;
  const skill = runtime.content.requireSkill(ability);
  const option = skill.choice?.options(state, owner, context, runtime).find(option => option.id === action.choice);
  const actor = skill.choice?.actor?.(state, owner, context) ?? owner;
  if (actor !== prompt.actor || (skill.choice?.ownerRequired !== false && !runtime.abilities.has(state, owner, ability)) || !option ||
    Boolean(option.pass) !== (action.type === 'pass') ||
    JSON.stringify(option.ids ?? []) !== JSON.stringify(action.ids ?? []) ||
    JSON.stringify(option.targets ?? []) !== JSON.stringify(action.targets ?? [])) throw new Error('内容技能选择已失效');
  if (!option.pass && !skill.choice?.silent) emitEvent(state, 'skillActivated', { ability, label: skill.label ?? ability, owner,
    targets: [...(option.targets ?? [])] });
  skill.choice!.execute(state, owner, context, action, runtime);
}

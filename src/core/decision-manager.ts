import type { Decision } from '../../contracts.ts';
import { resolutionStack } from '../domain/resolution-stack.ts';
import type { ActionData, GameState, InternalOption, InternalPrompt, PromptContextMap } from '../domain/state.ts';

export function setPrompt<K extends keyof PromptContextMap>(s: GameState, actor: number, kind: K,
  title: string, options: InternalOption[], ...args: {} extends PromptContextMap[K]
    ? [context?: PromptContextMap[K]] : [context: PromptContextMap[K]]): void {
  if (!options.length) throw new Error(`决策没有候选：${kind}`);
  // The generic key and its payload are correlated at this single construction boundary.
  const frame = resolutionStack.active(s);
  if (frame.prompt) throw new Error('当前结算帧已有待提交选择');
  frame.prompt = { frameId: frame.id, actor, kind, title, options, context: args[0] ?? {} } as InternalPrompt;
}
export const leaf = (id: string, label: string, data: ActionData): InternalOption => ({ id, label, data });
export function allLeaves(options: InternalOption[]): InternalOption[] {
  return options.flatMap(option => option.children ? allLeaves(option.children) : [option]);
}
export function legalActions(s: GameState): InternalOption[] {
  const prompt = resolutionStack.current(s)?.prompt;
  return prompt ? structuredClone(allLeaves(prompt.options)) : [];
}
export function decision(s: GameState): Decision | null {
  const prompt = resolutionStack.current(s)?.prompt;
  if (!prompt) return null;
  const { frameId: _frameId, ...visible } = prompt;
  return structuredClone(visible);
}

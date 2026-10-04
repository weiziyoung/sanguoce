import type { Choice, Decision } from '../../contracts.ts';

export interface ActionChoice {
  id: string;
  label: string;
  cardIds: number[];
  targetIds: number[];
  ability?: string;
  actionType?: string;
  zone?: string;
  slot?: number;
  placement?: string;
  children: ActionChoice[];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number') : [];
}

/** UI metadata is derived from structured legal action data, never from translated labels. */
export function projectChoice(choice: Choice): ActionChoice {
  const children = (choice.children ?? []).map(projectChoice);
  const data = choice.data && typeof choice.data === 'object' ?
    choice.data as Record<string, unknown> : {};
  const directCards = [...(typeof data.cid === 'number' ? [data.cid] : []),
    ...numberArray(data.ids), ...(typeof data.card === 'number' ? [data.card] : [])];
  const directTargets = [...numberArray(data.targets),
    ...(typeof data.target === 'number' ? [data.target] : [])];
  const abilities = [...new Set(children.map(child => child.ability).filter((id): id is string => Boolean(id)))];
  const ability = typeof data.ability === 'string' ? data.ability :
    typeof data.transformation === 'string' ? data.transformation : abilities.length === 1 ? abilities[0] : undefined;
  // Qilin identifies a public equipped horse by cid, without an explicit zone.
  // Route it through the same card picker and click handling as other equipment.
  const zone = typeof data.zone === 'string' ? data.zone : data.type === 'qilin' ? 'equip' : undefined;
  return {
    id: choice.id, label: choice.label,
    cardIds: [...new Set([...directCards, ...children.flatMap(child => child.cardIds)])],
    targetIds: [...new Set([...directTargets, ...children.flatMap(child => child.targetIds)])],
    ...(ability ? { ability } : {}),
    ...(typeof data.type === 'string' ? { actionType: data.type } : {}),
    ...(zone ? { zone } : {}),
    ...(typeof data.slot === 'number' ? { slot: data.slot } : {}),
    ...(typeof data.side === 'string' ? { placement: data.side } : {}),
    children,
  };
}

export function projectChoices(decision: Decision): ActionChoice[] {
  return decision.options.map(projectChoice);
}

export function choiceLeaves(choices: readonly ActionChoice[]): ActionChoice[] {
  return choices.flatMap(choice => choice.children.length ? choiceLeaves(choice.children) : [choice]);
}

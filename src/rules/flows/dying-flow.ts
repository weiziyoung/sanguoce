import { emitEvent } from '../../domain/event-journal.ts';
import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import { alive, card, nextAlive, person, push } from '../../domain/state-access.ts';
import type { ActionMap, DamageCause, GameState, PromptOf, Task } from '../../domain/state.ts';
import { vitals } from '../operations/vitals-service.ts';
import { spendCard, transformationCostLabel } from '../card-costs.ts';
import type { ContentRuntime } from '../content-runtime.ts';

export function beginDying(s: GameState, target: number, continuation: Task | null = null,
  cause: DamageCause = { kind: 'hpLoss', source: null }): void {
  resolutionStack.open(s, 'dying', { target, cursor: target, passed: [], cause },
    [{ kind: 'dyingPoll' }, ...(continuation ? [continuation] : [])]);
  emitEvent(s, 'dying', { target });
}

export function promptDying(s: GameState, runtime: ContentRuntime): void {
  const frame = resolutionStack.require(s, 'dying');
  const d = frame.data;
  const victim = person(s, d.target);
  if (victim.hp > 0 || !victim.alive) return;
  // Recompute participants on resume: a child may have killed a rescuer or consumed their peach.
  const living = alive(s);
  while (!living.every(id => d.passed.includes(id))) {
    const actor = d.cursor;
    if (person(s, actor).alive && !d.passed.includes(actor)) {
      const cards = [...runtime.transforms.candidates(s, actor, 'tao'),
        ...(actor === d.target ? runtime.transforms.candidates(s, actor, 'jiu') : [])];
      if (cards.length) {
        setPrompt(s, actor, 'dying',
          `${victim.label}濒死（${victim.hp}点体力）：使用【桃】或自用【酒】救治？`,
          [...cards.map(({ ids, transformation }) => leaf(transformation ?
            `save:transform:${transformation}:${ids.join(':')}` : `save:${ids[0]}`,
            `使用${transformation ? `${transformationCostLabel(s, ids)}当【桃】` : cardText(card(s, ids[0]))}`,
            { type: 'save', ids, ...(transformation ? { transformation } : {}) })),
          leaf('save-pass', '不救治', { type: 'pass' })], { target: d.target });
        return;
      }
      d.passed.push(actor);
    }
    d.cursor = nextAlive(s, actor);
  }
  push(s, { kind: 'death', context: {
    frameId: frame.id, parentFrameId: frame.parentId, target: d.target, cause: d.cause,
  } });
}

export function handleDyingChoice(s: GameState, prompt: PromptOf<'dying'>, data: ActionMap['dying'],
  runtime: ContentRuntime): void {
  const d = resolutionStack.require(s, 'dying').data;
  const actor = prompt.actor;
  if (data.type === 'save') {
    const selfWine = actor === d.target && !data.transformation && data.ids.length === 1 && s.cards[data.ids[0]].name === 'jiu';
    spendCard(s, actor, data.ids, selfWine ? 'jiu' : 'tao', 'use', runtime, data.transformation);
    if (data.transformation) emitEvent(s, 'transformationUsed', { ability: data.transformation,
      label: runtime.content.skillForTransformation(data.transformation).label ?? data.transformation,
      owner: actor, produces: 'tao' });
    vitals.recover(s, d.target, selfWine ? 1 : runtime.queries.rescueRecovery(s, actor, d.target), actor);
    emitEvent(s, 'rescued', { source: actor, target: d.target });
    d.passed = [];
  } else d.passed.push(actor);
  d.cursor = nextAlive(s, actor);
  push(s, { kind: 'dyingPoll' });
}

import { cardLabel, type CardLike } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, GameState, PromptOf } from '../../domain/state.ts';
import type { ContentRuntime } from '../content-runtime.ts';

/** Preparation and wine are scoped to one use, shared by all of its targets. */
export function beginAttackUse(s: GameState, source: number, sha: number | CardLike, targets: number[],
  runtime: ContentRuntime, intent: { ignoreDistance?: boolean; forcedBy?: number } = {}): void {
  const effective = typeof sha === 'number' ? s.cards[sha] : sha;
  const damageBonus = s.players[source].drunk ?? 0;
  delete s.players[source].drunk;
  const preparations = runtime.abilities.list(s, source).filter(skill => skill.prepareAttack).map(skill => skill.id);
  resolutionStack.open(s, 'attackUse', { source, sha, targets, nature: effective.nature ?? 'normal',
    damageBonus, preparations, cursor: 0, ...intent }, [{ kind: 'attackPrepare' }, { kind: 'attackLaunch' }]);
}

export function prepareAttack(s: GameState, runtime: ContentRuntime): void {
  const frame = resolutionStack.require(s, 'attackUse');
  const data = frame.data;
  while (data.cursor < data.preparations.length) {
    const ability = data.preparations[data.cursor++];
    const skill = runtime.content.requireSkill(ability);
    if (!runtime.abilities.has(s, data.source, ability) || !skill.prepareAttack?.available(s, data.source, data.nature)) continue;
    setPrompt(s, data.source, 'attackPrepare', `是否发动【${skill.label ?? ability}】？`, [
      leaf(`attack-prepare:${ability}:yes`, `发动，改为${cardLabel({ name: 'sha', suit: null, virtual: true, nature: skill.prepareAttack.nature })}`, { type: 'yes' }),
      leaf(`attack-prepare:${ability}:no`, '不发动', { type: 'no' }),
    ], { ability, source: data.source, targets: [...data.targets], damageBonus: data.damageBonus });
    return;
  }
}

export function chooseAttackPreparation(s: GameState, prompt: PromptOf<'attackPrepare'>,
  action: ActionMap['attackPrepare'], runtime: ContentRuntime): void {
  const frame = resolutionStack.require(s, 'attackUse');
  const { ability } = prompt.context;
  const skill = runtime.content.requireSkill(ability);
  if (action.type === 'yes') {
    if (prompt.actor !== frame.data.source || !runtime.abilities.has(s, prompt.actor, ability) ||
      !skill.prepareAttack?.available(s, prompt.actor, frame.data.nature)) throw new Error('杀的准备能力已失效');
    frame.data.nature = skill.prepareAttack.nature;
    emitEvent(s, 'skillActivated', { ability, label: skill.label ?? ability, owner: prompt.actor, targets: frame.data.targets });
  }
  resolutionStack.enqueue(s, { kind: 'attackPrepare' });
}

export function launchAttack(s: GameState, runtime: ContentRuntime): void {
  const { source, sha, targets, nature, damageBonus, ignoreDistance, forcedBy } = resolutionStack.require(s, 'attackUse').data;
  const ignoreArmor = runtime.queries.ignoresArmor(s, source);
  resolutionStack.enqueue(s, ...targets.map(target => ({ kind: 'shaStart' as const, source, sha, target,
    ...(nature === 'normal' ? {} : { nature }), ...(damageBonus ? { damageBonus } : {}),
    ...(ignoreArmor ? { ignoreArmor } : {}), ...(ignoreDistance === undefined ? {} : { ignoreDistance }),
    ...(forcedBy === undefined ? {} : { forcedBy }) })));
}

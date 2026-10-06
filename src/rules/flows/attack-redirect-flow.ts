import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, AttackContext, GameState, PromptOf } from '../../domain/state.ts';
import type { ContentRuntime } from '../content-runtime.ts';
import { discardOwned } from '../operations/cards.ts';

export class AttackRedirectFlow {
  readonly runtime: ContentRuntime;
  constructor(runtime: ContentRuntime) { this.runtime = runtime; }
  offer(state: GameState, attack: AttackContext, owner: number, ability: string): void {
    const definition = this.runtime.content.requireSkill(ability).attackRedirect;
    if (!definition) throw new Error('技能不支持转移目标');
    const costs = definition.costs(state, owner);
    const targets = definition.targets(state, owner, attack, this.runtime);
    setPrompt(state, owner, 'attackRedirect', `是否发动【${this.runtime.content.requireSkill(ability).label ?? ability}】？`, [
      ...costs.flatMap(card => targets.map(target => leaf(`redirect:${ability}:${card}:${target}`,
        `弃置${cardText(state.cards[card])}，将【杀】转给${state.players[target].label}`,
        { type: 'redirect', card, target }))),
      leaf(`redirect:${ability}:pass`, '不发动', { type: 'pass' }),
    ], { ...attack, owner, ability });
  }
  choice(state: GameState, prompt: PromptOf<'attackRedirect'>, action: ActionMap['attackRedirect']): void {
    if (action.type === 'pass') return;
    const { owner, ability, ...attack } = prompt.context;
    const skill = this.runtime.content.requireSkill(ability).attackRedirect;
    const window = resolutionStack.nearest(state, 'triggerWindow');
    if (!skill || prompt.actor !== owner || !this.runtime.abilities.has(state, owner, ability) ||
      !skill.costs(state, owner).includes(action.card) ||
      !skill.targets(state, owner, attack, this.runtime).includes(action.target) ||
      window.data.redirected || window.data.cancelled ||
      window.data.then[0]?.kind !== 'shaRespond') throw new Error('攻击目标转移已失效');
    emitEvent(state, 'skillActivated', { ability, label: this.runtime.content.requireSkill(ability).label ?? ability,
      owner, targets: [action.target] });
    discardOwned(state, owner, action.card);
    window.data.redirected = true;
    window.data.then = [{ kind: 'shaStart', ...attack, target: action.target, redirectedBy: owner }];
  }
}

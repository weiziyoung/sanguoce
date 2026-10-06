import { cardText } from '../../../catalog.ts';
import { leaf, setPrompt } from '../../core/decision-manager.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import { resolutionStack } from '../../domain/resolution-stack.ts';
import type { ActionMap, GameState, InternalOption, PromptOf, TaskOf } from '../../domain/state.ts';
import { discardOwned } from '../operations/cards.ts';
import { vitals } from '../operations/vitals-service.ts';
import type { ContentRuntime } from '../content-runtime.ts';

/** Active skills share candidate generation, cost payment, usage scope and execution checks. */
export class SkillFlow {
  readonly runtime: ContentRuntime;
  constructor(runtime: ContentRuntime) { this.runtime = runtime; }
  startOffer(state: GameState, task: TaskOf<'phaseStartOffer'>): void {
    const { ability, owner } = task;
    if (!this.runtime.abilities.has(state, owner, ability)) return;
    const skill = this.runtime.content.requireSkill(ability);
    if (!skill.startPhase?.available(state, owner)) return;
    setPrompt(state, owner, 'phaseStartChoice', `是否发动【${skill.label ?? ability}】？`, [
      leaf(`start-skill:${ability}:yes`, '发动', { type: 'yes' }),
      leaf(`start-skill:${ability}:no`, '不发动', { type: 'no' }),
    ], { ability, owner });
  }
  startChoice(state: GameState, prompt: PromptOf<'phaseStartChoice'>,
    action: ActionMap['phaseStartChoice']): void {
    if (action.type === 'no') return;
    const { ability, owner } = prompt.context;
    const skill = this.runtime.content.requireSkill(ability);
    if (prompt.actor !== owner || !this.runtime.abilities.has(state, owner, ability) ||
      !skill.startPhase?.available(state, owner)) throw new Error('准备阶段技能已失效');
    emitEvent(state, 'skillActivated', { ability, label: skill.label ?? ability, owner, targets: [] });
    skill.startPhase.activate(state, owner, this.runtime);
  }
  endOffer(state: GameState, task: TaskOf<'phaseEndOffer'>): void {
    const { ability, owner } = task;
    if (!this.runtime.abilities.has(state, owner, ability)) return;
    const skill = this.runtime.content.requireSkill(ability);
    if (!skill.endPhase?.available(state, owner)) return;
    if (skill.endPhase.optional === false) {
      emitEvent(state, 'skillActivated', { ability, label: skill.label ?? ability, owner, targets: [] });
      skill.endPhase.execute(state, owner);
      return;
    }
    setPrompt(state, owner, 'phaseEndChoice', `是否发动【${skill.label ?? ability}】？`, [
      leaf(`end-skill:${ability}:yes`, '发动', { type: 'yes' }),
      leaf(`end-skill:${ability}:no`, '不发动', { type: 'no' }),
    ], { ability, owner });
  }
  endChoice(state: GameState, prompt: PromptOf<'phaseEndChoice'>,
    action: ActionMap['phaseEndChoice']): void {
    if (action.type === 'no') return;
    const { ability, owner } = prompt.context;
    const skill = this.runtime.content.requireSkill(ability);
    if (prompt.actor !== owner || !this.runtime.abilities.has(state, owner, ability) ||
      !skill.endPhase?.available(state, owner)) throw new Error('结束阶段技能已失效');
    emitEvent(state, 'skillActivated', { ability, label: skill.label ?? ability, owner, targets: [] });
    skill.endPhase.execute(state, owner);
  }
  applyStartSkillJudgement(state: GameState, task: TaskOf<'applyStartSkillJudgement'>): void {
    const frame = resolutionStack.require(state, 'judgement');
    if (frame.data.reason !== task.ability || frame.data.owner !== task.owner) throw new Error('准备阶段判定不匹配');
    const skill = this.runtime.content.requireSkill(task.ability);
    if (!this.runtime.abilities.has(state, task.owner, task.ability)) return;
    if (skill.startPhase?.onJudgement?.(state, task.owner, frame.data.finalId)) {
      resolutionStack.enqueueParent(state, { kind: 'phaseStartOffer', ability: task.ability, owner: task.owner });
    }
  }
  used(state: GameState, owner: number, ability: string): number {
    return state.skillUses?.find(item => item.owner === owner && item.ability === ability && item.turn === state.turn)?.count ?? 0;
  }
  options(state: GameState, owner: number): InternalOption[] {
    return this.runtime.abilities.list(state, owner).flatMap(skill => {
      const active = skill.active;
      if (!active || (active.limit === 'oncePerTurn' && this.used(state, owner, skill.id))) return [];
      if (active.selection) {
        const selectable = active.selection.selectable(state, owner);
        return selectable.length >= active.selection.min ? [leaf(`skill:${skill.id}:begin`,
          `发动【${skill.label ?? skill.id}】`, { type: 'beginSkill', ability: skill.id })] : [];
      }
      const costs = active.costs!(state, owner);
      const choices = costs.flatMap(ids => {
        if (new Set(ids).size !== ids.length || ids.some(id => !state.players[owner].hand.includes(id) &&
          !Object.values(state.players[owner].equip).includes(id))) throw new Error(`主动技能成本不合法：${skill.id}`);
        const targets = active.targets(state, owner, ids);
        return targets.map((selected, index) => leaf(`skill:${skill.id}:${ids.join(':')}:${index}`,
          `${ids.length ? ids.map(id => cardText(state.cards[id])).join('＋') : '无牌'} → ${selected.map(id => state.players[id].label).join('、') || '自身'}`,
          { type: 'activeSkill', ability: skill.id, ids: [...ids], targets: [...selected] }));
      });
      return choices.length ? [{ id: `skill:${skill.id}`, label: `发动【${skill.label ?? skill.id}】`, children: choices }] : [];
    });
  }
  open(state: GameState, owner: number, ability: string, ids: number[], targets: number[]): void {
    resolutionStack.open(state, 'skill', { owner, ability, ids, targets }, [{ kind: 'skillExecute' }]);
  }
  openSelection(state: GameState, owner: number, ability: string): void {
    resolutionStack.open(state, 'skill', { owner, ability, ids: [], targets: [] }, [{ kind: 'skillSelectCost' }]);
  }
  selectCost(state: GameState): void {
    const frame = resolutionStack.require(state, 'skill');
    const { owner, ability, ids } = frame.data;
    const skill = this.runtime.content.requireSkill(ability);
    const selection = skill.active?.selection;
    if (!selection || !this.runtime.abilities.has(state, owner, ability)) throw new Error(`费用选择技能已失效：${ability}`);
    const candidates = [...selection.selectable(state, owner)];
    if (new Set(candidates).size !== candidates.length || ids.some(id => !candidates.includes(id))) {
      throw new Error(`费用候选已失效：${ability}`);
    }
    const options = candidates.filter(id => ids.includes(id) || ids.length < (selection.max ?? Infinity))
      .map(id => leaf(`skill-cost:${ability}:${id}`, `${ids.includes(id) ? '取消' : '选择'}${cardText(state.cards[id])}`,
        { type: 'toggle', cid: id }));
    if (ids.length >= selection.min) options.push(leaf(`skill-cost:${ability}:confirm`,
      `${skill.active?.cost === 'transfer' ? '确认交给目标' : '确认弃置'}${ids.length}张牌`, { type: 'confirm' }));
    options.push(leaf(`skill-cost:${ability}:cancel`, '取消发动', { type: 'cancel' }));
    setPrompt(state, owner, 'skillCost', `【${skill.label ?? ability}】：逐张选择${skill.active?.cost === 'transfer' ? '赠牌' : '费用'}（已选${ids.length}张）`, options, { ability, selectedIds: [...ids] });
  }
  costChoice(state: GameState, prompt: PromptOf<'skillCost'>, action: ActionMap['skillCost']): void {
    const frame = resolutionStack.require(state, 'skill');
    if (frame.data.ability !== prompt.context.ability || frame.data.owner !== prompt.actor) throw new Error('技能费用选择与结算帧不匹配');
    if (action.type === 'cancel') return;
    const selection = this.runtime.content.requireSkill(frame.data.ability).active?.selection;
    if (!selection) throw new Error('主动技能不支持逐步费用');
    if (action.type === 'confirm') {
      if (!validSelection(state, frame.data.owner, frame.data.ids, selection)) throw new Error('技能费用已失效');
      resolutionStack.enqueue(state, { kind: 'skillSelectTarget' });
      return;
    }
    const index = frame.data.ids.indexOf(action.cid);
    if (index >= 0) frame.data.ids.splice(index, 1);
    else frame.data.ids.push(action.cid);
    resolutionStack.enqueue(state, { kind: 'skillSelectCost' });
  }
  selectTarget(state: GameState): void {
    const frame = resolutionStack.require(state, 'skill');
    const { owner, ability, ids } = frame.data;
    const skill = this.runtime.content.requireSkill(ability);
    const targets = skill.active?.targets(state, owner, ids) ?? [];
    if (!targets.length) throw new Error(`技能目标已失效：${ability}`);
    if (targets.length === 1) {
      frame.data.targets = [...targets[0]];
      resolutionStack.enqueue(state, { kind: 'skillExecute' });
      return;
    }
    setPrompt(state, owner, 'skillTarget', `【${skill.label ?? ability}】：选择目标`, targets.map((selected, index) =>
      leaf(`skill-target:${ability}:${index}`, selected.map(id => state.players[id].label).join('、') || '自身',
        { type: 'select', targets: [...selected] })), { ability, selectedIds: [...ids] });
  }
  targetChoice(state: GameState, prompt: PromptOf<'skillTarget'>, action: ActionMap['skillTarget']): void {
    const frame = resolutionStack.require(state, 'skill');
    if (frame.data.ability !== prompt.context.ability || frame.data.owner !== prompt.actor) throw new Error('技能目标选择与结算帧不匹配');
    frame.data.targets = [...action.targets];
    resolutionStack.enqueue(state, { kind: 'skillExecute' });
  }
  execute(state: GameState): void {
    const { owner, ability, ids, targets } = resolutionStack.require(state, 'skill').data;
    const skill = this.runtime.content.requireSkill(ability);
    const active = skill.active;
    if (!active || !this.runtime.abilities.has(state, owner, ability) || state.phase !== 'play' ||
      state.active !== owner || (active.limit === 'oncePerTurn' && this.used(state, owner, ability))) {
      throw new Error(`主动技能已失效：${ability}`);
    }
    const validCost = active.selection ? validSelection(state, owner, ids, active.selection) :
      active.costs!(state, owner).some(candidate => same(candidate, ids));
    const validTarget = active.targets(state, owner, ids).some(candidate => same(candidate, targets));
    if (!validCost || !validTarget || ((active.cost === 'none' || active.cost === 'loseHp') && ids.length)) {
      throw new Error(`主动技能费用或目标已失效：${ability}`);
    }
    if (active.cost === 'discardOwned') for (const id of ids) discardOwned(state, owner, id);
    if (active.cost === 'loseHp') {
      vitals.loseHp(state, owner, 1);
      emitEvent(state, 'hpLost', { player: owner, amount: 1 });
    }
    state.skillUses ??= [];
    const record = state.skillUses.find(item => item.owner === owner && item.ability === ability);
    if (record && record.turn === state.turn) record.count++;
    else if (record) { record.turn = state.turn; record.count = 1; }
    else state.skillUses.push({ owner, ability, turn: state.turn, count: 1 });
    emitEvent(state, 'skillActivated', { ability, label: skill.label ?? ability, owner, targets });
    if (active.cost === 'loseHp') {
      resolutionStack.enqueue(state, { kind: 'skillDying' }, { kind: 'skillEffect' });
      return;
    }
    active.execute?.(state, owner, ids, targets);
    if (active.followup) {
      const actor = active.followup.actor(state, owner, targets);
      const options = active.followup.options(state, owner, targets);
      if (!options.length) throw new Error(`技能后续选项为空：${ability}`);
      setPrompt(state, actor, 'skillFollowup', `【${skill.label ?? ability}】：选择后续效果`,
        options.map(option => leaf(`skill-followup:${ability}:${option.id}`, option.label,
          { type: 'choose', choice: option.id })), { ability, owner });
    }
  }
  effect(state: GameState): void {
    const { owner, ability, ids, targets } = resolutionStack.require(state, 'skill').data;
    if (!state.players[owner].alive) return;
    this.runtime.content.requireSkill(ability).active?.execute?.(state, owner, ids, targets);
  }
  applyAttackJudgement(state: GameState, task: TaskOf<'applyAttackJudgement'>): void {
    const frame = resolutionStack.require(state, 'judgement');
    if (frame.data.owner !== task.source || frame.data.reason !== task.ability) {
      throw new Error('攻击判定与技能不匹配');
    }
    const skill = this.runtime.content.requireSkill(task.ability);
    if (!skill.attackJudgement || !this.runtime.abilities.has(state, task.source, task.ability)) return;
    if (skill.attackJudgement.bypassResponse(state, task.source, frame.data.finalId)) {
      const window = resolutionStack.nearest(state, 'triggerWindow');
      const { ability: _ability, kind: _kind, ...attack } = task;
      window.data.then = [{ ...attack, kind: 'shaHit' }];
    }
  }
  applySkillJudgement(state: GameState, task: TaskOf<'applySkillJudgement'>): void {
    const frame = resolutionStack.require(state, 'judgement');
    if (frame.data.owner !== task.owner || frame.data.reason !== task.ability) {
      throw new Error('技能判定与结算帧不匹配');
    }
    const skill = this.runtime.content.requireSkill(task.ability);
    if (!skill.skillJudgement || !this.runtime.abilities.has(state, task.owner, task.ability)) return;
    const actor = skill.skillJudgement.actor(state, task.owner, task.source);
    const options = skill.skillJudgement.options(state, task.owner, task.source, frame.data.finalId);
    if (actor === null || !options.length) return;
    setPrompt(state, actor, 'skillJudgementChoice', `【${skill.label ?? skill.id}】：选择判定后效果`,
      options.map(option => leaf(`skill-judge:${skill.id}:${option.id}`, option.label,
        { type: 'choose', choice: option.id, ids: [...(option.cardIds ?? [])] })),
      { ability: skill.id, owner: task.owner, source: task.source });
  }
  skillJudgementChoice(state: GameState, prompt: PromptOf<'skillJudgementChoice'>,
    action: ActionMap['skillJudgementChoice']): void {
    const frame = resolutionStack.require(state, 'judgement');
    const { ability, owner, source } = prompt.context;
    if (frame.data.owner !== owner || frame.data.reason !== ability) throw new Error('技能判定选择与结算帧不匹配');
    const skill = this.runtime.content.requireSkill(ability);
    const effect = skill.skillJudgement;
    if (!effect || effect.actor(state, owner, source) !== prompt.actor ||
      !effect.options(state, owner, source, frame.data.finalId).some(option => option.id === action.choice)) {
      throw new Error('技能判定后效果已失效');
    }
    effect.execute(state, owner, source, frame.data.finalId, action.choice);
  }
  followupChoice(state: GameState, prompt: PromptOf<'skillFollowup'>,
    action: ActionMap['skillFollowup']): void {
    const frame = resolutionStack.require(state, 'skill');
    const { owner, ability, targets } = frame.data;
    if (owner !== prompt.context.owner || ability !== prompt.context.ability) throw new Error('技能后续选择与结算帧不匹配');
    const followup = this.runtime.content.requireSkill(ability).active?.followup;
    if (!followup || followup.actor(state, owner, targets) !== prompt.actor ||
      !followup.options(state, owner, targets).some(option => option.id === action.choice)) {
      throw new Error('技能后续选项已失效');
    }
    followup.execute(state, owner, targets, action.choice);
  }
}
const same = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);
const validSelection = (state: GameState, owner: number, ids: readonly number[],
  selection: { min: number; max?: number; selectable(state: GameState, owner: number): readonly number[] }) => {
  const candidates = selection.selectable(state, owner);
  return ids.length >= selection.min && ids.length <= (selection.max ?? Infinity) &&
    new Set(ids).size === ids.length && ids.every(id => candidates.includes(id));
};

import type { Choice, Decision, DecisionPolicy, GameConfig, Observation, RuleSet, Transition, TransitionSink } from '../../contracts.ts';

export interface TraceRecorder<State> { record(transition: Transition, state: State): void; }
export interface Selection { decisionId: string; optionId: string; }

/** Owns the committed state. Rules and external observers never share a returned snapshot. */
export class GameEngine<State> {
  #state: State;
  #revision = 0;
  readonly rules: RuleSet<State>;
  readonly trace: TraceRecorder<State> | null;

  constructor(rules: RuleSet<State>, config: GameConfig = {}, trace: TraceRecorder<State> | null = null) {
    this.rules = rules;
    this.trace = trace;
    const frames = this.buffer();
    this.#state = structuredClone(rules.create(config, frames.sink));
    frames.flush();
  }
  getDecision(): Decision | null {
    const decision = this.rules.decision(this.#state);
    return decision ? { ...structuredClone(decision), id: this.decisionId() } : null;
  }
  getObservation(playerId: number): Observation {
    return structuredClone(this.rules.observe(this.#state, playerId));
  }
  getLegalActions(): Choice[] {
    return structuredClone(this.rules.legalActions(this.#state));
  }
  choose(selection: string | Selection): this {
    if (typeof selection !== 'string' && selection.decisionId !== this.decisionId()) {
      throw new Error('决策已过期，请重新获取当前选择');
    }
    const frames = this.buffer();
    const next = this.rules.apply(structuredClone(this.#state), typeof selection === 'string' ? selection : selection.optionId, frames.sink);
    this.#state = next;
    this.#revision++;
    frames.flush();
    return this;
  }
  async chooseWith(policy: DecisionPolicy): Promise<this> {
    const current = this.getDecision();
    if (!current) return this;
    const observation = this.getObservation(current.actor);
    const choiceId = await policy.choose(observation, current);
    return this.choose({ decisionId: current.id!, optionId: choiceId });
  }
  get finished(): boolean {
    return this.rules.isFinished?.(this.#state) ?? (this.getDecision() === null);
  }
  private decisionId(): string { return `decision-${this.#revision}`; }
  private buffer(): { sink: TransitionSink<State> | undefined; flush(): void } {
    const frames: { transition: Transition; state: State }[] = [];
    const recorder = this.trace;
    return {
      sink: recorder ? (transition, state) => {
        frames.push({ transition: structuredClone(transition), state: structuredClone(state) });
      } : undefined,
      flush: () => { for (const frame of frames) recorder!.record(frame.transition, frame.state); },
    };
  }
}

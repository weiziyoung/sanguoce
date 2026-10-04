import type { Choice, Decision } from '../../contracts.ts';
import type { EvaluationContext } from './evaluation-context.ts';

export type ScoredAction = {
  type?: string; ability?: string; transformation?: string; cid?: number; ids?: number[];
  targets?: number[]; target?: number; card?: number; choice?: string;
  cname?: string; side?: string; zone?: string;
};
export type SkillEvaluator = (context: EvaluationContext, decision: Decision, choice: Choice,
  action: ScoredAction) => number | undefined;
export type GeneralEvaluator = (context: EvaluationContext, decision: Decision, choice: Choice,
  action: ScoredAction, baseScore: number) => number;

/** Skill ids are data, not branches in the generic policy. */
export class EvaluationRegistry {
  private readonly evaluators = new Map<string, SkillEvaluator>();
  private readonly generals = new Map<string, GeneralEvaluator>();
  registerGeneral(id: string, evaluator: GeneralEvaluator): this {
    if (this.generals.has(id)) throw new Error(`重复的武将 AI：${id}`);
    this.generals.set(id, evaluator);
    return this;
  }
  adjust(context: EvaluationContext, decision: Decision, choice: Choice,
    action: ScoredAction, baseScore: number): number {
    const evaluator = context.self.general ? this.generals.get(context.self.general) : undefined;
    return evaluator?.(context, decision, choice, action, baseScore) ?? baseScore;
  }
  register(id: string, evaluator: SkillEvaluator): this {
    if (this.evaluators.has(id)) throw new Error(`重复的技能 AI：${id}`);
    this.evaluators.set(id, evaluator);
    return this;
  }
  score(id: string | undefined, context: EvaluationContext, decision: Decision, choice: Choice,
    action: ScoredAction): number | undefined {
    return id ? this.evaluators.get(id)?.(context, decision, choice, action) : undefined;
  }
  has(id: string): boolean { return this.evaluators.has(id); }
}

import type { GeneralDefinition, SkillDefinition } from '../../../rules/content-registry.ts';

/** A general owns its identity and skill declarations. Shared rules execute them. */
export interface StandardGeneralModule {
  readonly general: GeneralDefinition;
  readonly skills: readonly SkillDefinition[];
}

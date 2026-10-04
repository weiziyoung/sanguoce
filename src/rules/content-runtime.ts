import { AbilityResolver } from './ability-resolver.ts';
import { CardTransformResolver } from './card-transform-resolver.ts';
import { ContentRegistry } from './content-registry.ts';
import { RuleQueryService } from './rule-query-service.ts';
import { TriggerRegistry } from './trigger-registry.ts';

/** Per-ruleset service composition. GameState stores data, not executable definitions. */
export class ContentRuntime {
  readonly content: ContentRegistry;
  readonly abilities: AbilityResolver;
  readonly transforms: CardTransformResolver;
  readonly queries: RuleQueryService;
  readonly triggers: TriggerRegistry;
  constructor(content: ContentRegistry, triggers?: TriggerRegistry) {
    this.content = content;
    this.abilities = new AbilityResolver(content);
    this.transforms = new CardTransformResolver(content.skills()
      .flatMap(skill => [...(skill.transformation ? [skill.transformation] : []), ...(skill.transformations ?? [])]), this.abilities);
    this.queries = new RuleQueryService([], this.abilities);
    this.triggers = triggers ?? new TriggerRegistry(content.skills()
      .flatMap(skill => skill.trigger ? [skill.trigger] : []));
  }
}

import { standardContent } from '../content/standard/content.ts';
import { TriggerRegistry } from '../rules/trigger-registry.ts';
export const standardTriggers = new TriggerRegistry(standardContent.skills().flatMap(skill => skill.trigger ? [skill.trigger] : []));

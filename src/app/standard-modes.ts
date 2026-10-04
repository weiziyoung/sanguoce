import { DuelMode } from '../modes/duel-mode.ts';
import { IdentityMode } from '../modes/identity-mode.ts';
import { ModeRegistry } from '../rules/mode-registry.ts';

export const standardModes = new ModeRegistry([new DuelMode(), new IdentityMode()]);

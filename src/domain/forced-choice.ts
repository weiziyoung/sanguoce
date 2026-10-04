import type { Choice, Decision } from '../../contracts.ts';

/** Return the sole legal leaf action, including when it is nested under choice groups. */
export function forcedActionId(decision: Decision): string | null {
  let only: string | null = null;
  function visit(options: readonly Choice[]): boolean {
    for (const option of options) {
      if (option.children) {
        if (visit(option.children)) return true;
      } else if (only !== null) {
        return true;
      } else {
        only = option.id;
      }
    }
    return false;
  }
  return visit(decision.options) ? null : only;
}

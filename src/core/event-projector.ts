import type { RuleEvent, VisibleEvent } from '../domain/events.ts';

/** Privacy is fixed by the event's original visibility, never inferred from today's zones. */
export function projectEvent(event: RuleEvent, viewer: number): VisibleEvent | null {
  switch (event.kind) {
    case 'cardsMoved': case 'hpChanged': case 'triggerInvoked':
    case 'attackTargeted': case 'attackMissed': case 'beforeAttackDamage': case 'damageTaken': case 'judgementApplied':
    case 'cardsLost': return null;
    case 'gained': {
      const { from, to, card, hidden, selection, cause } = event.data;
      return { id: event.id, kind: 'gained', data: { from, to,
        card: !hidden || viewer === from || viewer === to ? card : null,
        ...(selection ? { selection } : {}), ...(cause ? { cause } : {}) } };
    }
    case 'drawn': case 'judged': case 'judgementReplaced': case 'discarded': case 'equipped': case 'recovered': case 'hpLost':
    case 'damaged': case 'dying': case 'died': case 'reshuffled': case 'turnStarted':
    case 'duelResponded': case 'duelEnded': case 'rescued': case 'attackDeclared':
    case 'playSkipped': case 'delayPlaced': case 'cardUsed': case 'harvestRevealed':
    case 'harvestLeftover': case 'harvestTaken': case 'borrowedAttack': case 'lightningMoved':
    case 'trickCancelled': case 'nullificationUsed': case 'abilityActivated': case 'transformationUsed': case 'skillActivated': case 'rolesRevealed':
      return structuredClone({ id: event.id, kind: event.kind, data: event.data }) as VisibleEvent;
    default: { const unreachable: never = event; throw new Error(`事件未声明可见性：${unreachable}`); }
  }
}

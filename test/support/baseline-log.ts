import type { GameState } from '../../src/domain/state.ts';
import { formatEvent } from '../../src/presentation/event-formatter.ts';

const legacyEquipmentLabels = new Set([
  'standard.cixiong', 'standard.renwang', 'standard.qinglong',
  'standard.guanshi', 'standard.hanbing', 'standard.qilin',
]);

/** Frozen rule hashes include the old equipment labels. Normalize only those display fields;
 * keep the original fixtures and all action, state and other log comparisons unchanged. */
export function baselineLog(state: GameState): string[] {
  return state.events.map(event => formatEvent(
    event.kind === 'skillActivated' && legacyEquipmentLabels.has(event.data.ability) ?
      { ...event, data: { ...event.data, label: event.data.ability } } : event,
    state,
  )).filter((line): line is string => line !== null);
}

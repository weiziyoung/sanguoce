import type { Card } from '../../catalog.ts';
import type { Decision, Observation } from '../../contracts.ts';
import { pendingJudgementCard } from './judgement-card.ts';
import { judgementTablePosition, type Point } from './layout.ts';

interface TableDisplay {
  zonePickerCount: number;
  activeJudgement: boolean;
  hasTableCard(id: number): boolean;
}
export interface TablePreview {
  card: Card;
  position: Point;
  label?: string;
  selectable: boolean;
}

/** A pending judgement remains visible alongside equipment offered as replacement costs. */
export function tablePreviewCards(obs: Observation, decision: Decision | null,
  selectableCards: readonly number[], display: TableDisplay): TablePreview[] {
  const judgement = pendingJudgementCard(obs, decision);
  if (judgement) return display.hasTableCard(judgement.id) ? [] : [{ card: judgement,
    position: judgementTablePosition(display.zonePickerCount), label: '判定牌', selectable: false }];
  if (display.zonePickerCount || display.activeJudgement) return [];
  const table = obs.table.filter(card => !display.hasTableCard(card.id));
  const relevant = table.filter(card => selectableCards.includes(card.id));
  const shown = relevant.length ? relevant : table.slice(-3);
  const centerX = decision?.kind === 'deckReorder' ? 755 : 790;
  const spacing = Math.min(128, 570 / Math.max(1, shown.length));
  return shown.map((card, index) => ({ card, selectable: relevant.length > 0,
    position: { x: centerX + (index - (shown.length - 1) / 2) * spacing, y: 483 } }));
}

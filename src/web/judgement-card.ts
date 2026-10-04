import { NAMES, type Card } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';

export type JudgementCardCue =
  | { kind: 'finish'; card: Card; label: string }
  | { kind: 'replace'; card: Card; oldCard: Card; owner: number; label: string };

/** Every judgement phase uses only cards and facts already public to this viewer. */
export function judgementCard(event: VisibleEvent, obs: Observation): JudgementCardCue | null {
  if (event.kind !== 'judgementReplaced' && event.kind !== 'judged') return null;
  const id = event.kind === 'judgementReplaced' ? event.data.newCard : event.data.card;
  const card = obs.eventCards?.[id];
  if (!card) return null;
  const reason = event.data.reasonLabel ?? NAMES[event.data.reason] ?? event.data.reason;
  const seat = (player: number) => obs.mode.id === 'identity' ? `座${player + 1}` :
    player === obs.self.id ? '你' : '对手';
  if (event.kind === 'judgementReplaced') {
    const oldCard = obs.eventCards?.[event.data.oldCard];
    return oldCard ? {
      kind: 'replace', card, oldCard, owner: event.data.owner,
      label: `${seat(event.data.owner)} · ${event.data.label}\n改判${seat(event.data.player)}的${reason}`,
    } : null;
  }
  const red = card.suit === 'heart' || card.suit === 'diamond';
  const outcome = (() => {
    switch (event.data.reason) {
      case 'bagua': return red ? '红色 · 视为闪' : '黑色 · 判定失败';
      case 'lebu': return card.suit === 'heart' ? '不跳过出牌' : '跳过出牌';
      case 'shandian': return card.suit === 'spade' && card.rank >= 2 && card.rank <= 9 ? '闪电命中' : '闪电未命中';
      case 'standard.tieji': return red ? '红色 · 不可出闪' : '黑色 · 可以出闪';
      case 'standard.ganglie': return card.suit === 'heart' ? '红桃 · 刚烈未生效' : '非红桃 · 刚烈生效';
      case 'standard.luoshen': return red ? '红色 · 洛神结束' : '黑色 · 获得判定牌';
      default: return red ? '红色判定牌' : '黑色判定牌';
    }
  })();
  return { kind: 'finish', card, label: `${seat(event.data.player)} · ${reason}判定\n${outcome}` };
}

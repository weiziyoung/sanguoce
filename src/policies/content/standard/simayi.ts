import { cardColor, type Card } from '../../../../catalog.ts';
import type { SkillEvaluator } from '../../evaluation-registry.ts';

const favorable = (reason: string, card: Card): boolean | undefined => {
  if (reason === 'wind.leiji') return card.suit !== 'spade';
  if (reason === 'bingliang') return card.suit === 'club';
  if (reason === 'lebu') return card.suit === 'heart';
  if (reason === 'shandian') return !(card.suit === 'spade' && card.rank >= 2 && card.rank <= 9);
  if (reason === 'bagua' || reason === 'standard.tieji') return cardColor(card) === 'red';
  if (reason === 'standard.luoshen') return cardColor(card) === 'black';
  if (reason === 'standard.ganglie') return card.suit !== 'heart';
  return undefined;
};

/** 鬼才: change a public judgement only when the resulting swing exceeds the card cost. */
export const guicaiEvaluation: SkillEvaluator = (ctx, decision, _choice, action) => {
  if (decision.kind !== 'judgeReplace' || action.type !== 'replace') return undefined;
  const prompt = decision.context as { subject?: number; reason?: string; currentId?: number } | undefined;
  if (prompt?.subject === undefined || !prompt.reason) return -10;
  const current = ctx.card(prompt.currentId);
  const replacement = ctx.card(action.cid);
  if (!current || !replacement) return -10;
  const subject = ctx.player(prompt.subject);
  const effective = (card: Card): Card => subject?.general === 'wind.xiaoqiao' && card.suit === 'spade' ? { ...card, suit: 'heart' } : card;
  const before = favorable(prompt.reason, effective(current));
  const after = favorable(prompt.reason, effective(replacement));
  if (before === undefined || after === undefined || before === after) return -10;
  return (after ? 1 : -1) * ctx.relation(prompt.subject) * 8 - 0.35 * ctx.value(action.cid);
};

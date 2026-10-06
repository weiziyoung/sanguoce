import { cardText, NAMES, type Card } from '../../catalog.ts';
import type { DiscardReason, RuleEvent, VisibleEvent } from '../domain/events.ts';

const DISCARD_LABELS: Record<DiscardReason, string> = {
  discard: '弃置', use: '使用', respond: '打出', convertToSha: '将手牌作为【杀】弃置',
};

interface EventLabels { players: readonly { id: number; label: string }[]; cards: Readonly<Record<number, Card>>; }
/** Formatting consumes facts; it neither decides visibility nor runs rules. */
export function formatEvent(event: RuleEvent | VisibleEvent, labels: EventLabels): string | null {
  const player = (id: number) => labels.players.find(p => p.id === id)!.label;
  const card = (id: number) => cardText(labels.cards[id]);
  const name = (id: string) => NAMES[id] ?? Object.values(labels.cards).find(card => card.name === id)?.label ?? id;
  switch (event.kind) {
    case 'chainChanged': return `${player(event.data.player)}${event.data.chained ? '进入连环状态' : '解除连环状态'}`;
    case 'wineUsed': return `${player(event.data.player)}饮酒，下一张杀的伤害+${event.data.bonus}`;
    case 'cardRecast': return `${player(event.data.player)}重铸${card(event.data.card)}`;
    case 'cardRevealed': return `${player(event.data.player)}展示${card(event.data.card)}`;
    case 'drawSkipped': return `${player(event.data.player)}跳过摸牌阶段`;
    case 'drawn': return `${player(event.data.player)}摸了${event.data.count}张牌`;
    case 'judged': return `${player(event.data.player)}的【${event.data.reasonLabel ?? name(event.data.reason)}】判定：${card(event.data.card)}`;
    case 'judgementReplaced': return `${player(event.data.owner)}发动【${event.data.label}】，以${card(event.data.newCard)}替换${player(event.data.player)}的【${event.data.reasonLabel ?? name(event.data.reason)}】判定牌${card(event.data.oldCard)}`;
    case 'discarded': return `${player(event.data.player)}${DISCARD_LABELS[event.data.reason]}${card(event.data.card)}`;
    case 'gained': return `${player(event.data.to)}获得${player(event.data.from)}的${event.data.card === null ? '一张手牌' : card(event.data.card)}`;
    case 'equipped': return `${player(event.data.player)}${event.data.replaced ? '替换了' : '装备'}${card(event.data.card)}`;
    case 'recovered': return `${player(event.data.player)}回复${event.data.amount}点体力`;
    case 'hpLost': return `${player(event.data.player)}失去${event.data.amount}点体力`;
    case 'damaged': return `${player(event.data.target)}受到${event.data.amount}点${event.data.source === null ? '无来源' : player(event.data.source) + '造成的'}${event.data.nature === 'fire' ? '火焰' : event.data.nature === 'thunder' ? '雷电' : ''}伤害（${event.data.hp}/${event.data.maxHp}）`;
    case 'dying': return `${player(event.data.target)}进入濒死状态`;
    case 'died': return `${player(event.data.target)}阵亡`;
    case 'reshuffled': return '弃牌堆洗回牌堆';
    case 'turnStarted': return `第${event.data.turn}回合，${player(event.data.player)}开始行动`;
    case 'playSkipped': return `${player(event.data.player)}${event.data.announced ? '本回合' : ''}跳过出牌阶段`;
    case 'delayPlaced': return `${player(event.data.source)}将${event.data.effectiveName ? `【${name(event.data.effectiveName)}】` : card(event.data.card)}置于${player(event.data.target)}判定区`;
    case 'cardUsed': return `${player(event.data.source)}使用${event.data.effectiveName ? `【${name(event.data.effectiveName)}】` : card(event.data.card)}${event.data.targets.length ? `，目标：${event.data.targets.map(player).join('、')}` : ''}`;
    case 'harvestRevealed': return `【五谷丰登】亮出：${event.data.cards.map(card).join('、')}`;
    case 'harvestLeftover': return `未被选择的${card(event.data.card)}进入弃牌堆`;
    case 'harvestTaken': return `${player(event.data.player)}从【五谷丰登】获得${card(event.data.card)}`;
    case 'borrowedAttack': return `${player(event.data.player)}受【借刀杀人】要求使用【杀】`;
    case 'lightningMoved': return event.data.target === null ? '【闪电】无法继续传递，置入弃牌堆' : `【闪电】传递给${player(event.data.target)}`;
    case 'trickCancelled': return `【${name(event.data.cname)}】对${player(event.data.target)}的效果被抵消`;
    case 'nullificationUsed': return `${player(event.data.player)}使用【无懈可击】`;
    case 'transformationUsed': return `${player(event.data.owner)}发动【${event.data.label}】，使用【${name(event.data.produces ?? 'sha')}】`;
    case 'skillActivated': return `${player(event.data.owner)}发动【${event.data.label}】${event.data.targets.length ? `，目标：${event.data.targets.map(player).join('、')}` : ''}`;
    case 'abilityActivated': {
      const ability = `【${name(event.data.ability)}】`;
      const owner = event.data.owner === null ? '' : player(event.data.owner);
      switch (event.data.effect) {
        case 'followUp': return `${owner}发动${ability}追击`;
        case 'forceHit': return `${owner}发动${ability}，令【杀】命中`;
        case 'preventDamage': return `${owner}发动${ability}，防止伤害`;
        case 'virtualSha': return `${owner}发动${ability}，使用【杀】`;
        case 'autoShan': return `${ability}视为打出【闪】`;
        case 'blockBlackSha': return `${ability}令黑色【杀】无效`;
      }
    }
    default: return null; // Rule timing / audit facts need not create a human log line.
  }
}
/** Omniscient diagnostics only; never use for a player's observation. */
export function debugLog(state: EventLabels & { events: readonly RuleEvent[] }): string[] {
  return state.events.map(event => formatEvent(event, state)).filter((line): line is string => line !== null);
}

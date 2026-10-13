import type { Observation } from '../../contracts.ts';
import { cardLabel } from '../../catalog.ts';
import type { TableInteraction } from './interaction-model.ts';

const PHASES: Readonly<Record<string, string>> = { judge: '判定', draw: '摸牌', play: '出牌', discard: '弃牌' };

/** Explain each resumable step using only public state and the current legal decision. */
export function qiaobianPresentation(obs: Observation, model: TableInteraction | null) {
  const context = model?.qiaobianContext;
  if (!model || !context) return null;
  const phase = PHASES[context.mode ?? ''] ?? '此';
  if (context.timing === 'cost') return {
    phase: `${phase}阶段前`,
    prompt: `巧变：弃1张手牌跳过${phase}阶段（已选 ${model.cards.length}/1），或正常${phase}`,
    primary: `弃牌并跳过${phase}`, pass: `正常${phase}`,
    hint: '先点选一张手牌，再确认发动 · 此时还未弃牌 · 装备不能作为费用',
  };
  if (context.timing === 'draw') {
    const received = context.remaining?.length ?? 0;
    const available = model.scoped.some(choice => choice.targetIds.length);
    return { phase: '摸牌阶段 · 已跳过',
      prompt: available ? `巧变：点选一名有手牌的其他角色，再确认获得（已获得 ${received}/2）` : '巧变：已跳过摸牌，没有可获得手牌的角色，请结束巧变',
      primary: '获得其手牌', pass: received ? '结束获得手牌' : '不获得手牌',
      hint: '每次选一名角色并确认，最多两名不同角色 · 结束后不会正常摸两张牌',
    };
  }
  const players = [obs.self, ...obs.others];
  const card = players.flatMap(player => [...Object.values(player.equip), ...player.judge])
    .find(card => card?.id === model.cards[0]);
  const owner = players.find(player => player.id === model.targets[0]);
  const recipient = players.find(player => player.id === model.targets[1]);
  const available = model.scoped.some(choice => choice.cardIds.length);
  return { phase: '出牌阶段 · 已跳过',
    prompt: !available ? '巧变：已跳过出牌，没有合法可移动的牌，请结束巧变' :
      !model.cards.length ? '巧变：先选一张场上的装备或判定牌，再选接收者' :
      recipient ? `巧变：将${owner?.label ?? '原角色'}的${card ? cardLabel(card) : '所选牌'}移给${recipient.label}，请确认` :
      `巧变：已选${owner?.label ?? '原角色'}的${card ? cardLabel(card) : '牌'}，点选亮起的接收者`,
    primary: '确认移动', pass: '不移动牌',
    hint: '可点中央原牌或角色的装备／判定区 · 原主人自动确定 · 选接收者后确认 · 不移动也会跳过出牌',
  };
}

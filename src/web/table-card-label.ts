import { NAMES, CARD_SPECS, cardLabel, type CardName } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';
import type { CardDefinition } from '../rules/content-registry.ts';

function seat(id: number, obs: Observation): string {
  if (obs.mode.id === 'identity') return `座${id + 1}`;
  return id === obs.self.id ? '你' : '对手';
}

function targetText(name: CardName, ids: readonly number[], source: number, obs: Observation): string {
  if (ids.length) return ids.map(id => seat(id, obs)).join('、');
  const definition = CARD_SPECS.find(spec => spec.id === name) as CardDefinition | undefined;
  if (!definition) return '无指定目标';
  if (definition.play.scope === 'all') return '全场';
  if (definition.play.scope === 'others') return '其他角色';
  if (definition.play.scope === 'self' || definition.kind === 'equip' || definition.effect === 'recover' || name === 'jiu')
    return seat(source, obs);
  return '无指定目标';
}

/** Short captions for cards on the table. All facts come from public events. */
export function tableCardLabel(event: VisibleEvent, obs: Observation): string | null {
  if (event.kind === 'cardUsed') {
    const card = obs.eventCards?.[event.data.card];
    const name = event.data.effectiveName ?? card?.name;
    if (!name) return null;
    const targets = event.data.targets;
    return `${seat(event.data.source, obs)} 使用${event.data.effectiveName ? NAMES[name] ?? name : card ? cardLabel(card) : NAMES[name] ?? name}\n${targetText(name, targets, event.data.source, obs)}`;
  }
  if (event.kind === 'nullificationUsed')
    return `${seat(event.data.player, obs)} 打出无懈\n${event.data.parityBefore % 2 ? '恢复' : '抵消'}${NAMES[event.data.cname]}·${seat(event.data.target, obs)}`;
  if (event.kind === 'harvestTaken') {
    const card = obs.eventCards?.[event.data.card];
    return card ? `${seat(event.data.player, obs)} 选择\n${NAMES[card.name] ?? card.name}` : null;
  }
  if (event.kind === 'duelResponded') return `${seat(event.data.player, obs)}\n决斗出杀`;
  if (event.kind === 'discarded' && event.data.reason === 'respond')
    return `${seat(event.data.player, obs)}\n打出响应牌`;
  return null;
}

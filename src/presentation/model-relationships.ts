import type { Observation, VisiblePlayer } from '../../contracts.ts';
import { publicInteractions, type PublicInteraction } from '../domain/public-interactions.ts';
import { RelationshipModel } from '../policies/relationship-model.ts';

const clamp = (value: number) => Math.max(-5, Math.min(5, value));
const signed = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(2))}`;
const effect = (pair: PublicInteraction) => pair.damage + Math.max(0, pair.attacks - pair.attackHits) +
  pair.disruption * 0.5 - pair.recovery - pair.gifts * 0.5 - pair.protection * 0.5;

export interface ModelRelationship {
  player: VisiblePlayer;
  hate: number;
  behaviorHate: number;
  baselineHate: number;
  evidence: { interaction: PublicInteraction; importance: number; contribution: number }[];
}

/** Model context uses cumulative public facts; it does not change the rule AI evaluator. */
export function modelRelationships(observation: Observation): ModelRelationship[] {
  const players = [observation.self, ...observation.others].sort((a, b) => a.id - b.id);
  // Recent events must not be counted again on top of the whole-game totals.
  const baseline = new RelationshipModel({ ...observation, events: [] });
  const importance = (id: number): number => {
    const target = players.find(player => player.id === id);
    if (target && !target.alive && target.role && observation.self.role !== 'renegade') {
      const rebel = observation.self.role === 'rebel';
      return target.role === 'renegade' ? rebel ? -0.2 : -0.35 : (target.role === 'rebel') === rebel ? 1 : -1;
    }
    return baseline.relation(id);
  };
  const history = observation.publicInteractions ?? publicInteractions(observation.events,
    id => observation.eventCards?.[id]?.name);
  return players.map(player => {
    if (player.id === observation.self.id) return { player, hate: 0, behaviorHate: 0, baselineHate: 0, evidence: [] };
    const evidence = history.filter(pair => pair.source === player.id).map(interaction => {
      const weight = importance(interaction.target);
      return { interaction, importance: weight, contribution: effect(interaction) * weight };
    });
    const behaviorHate = evidence.reduce((sum, item) => sum + item.contribution, 0);
    const baselineHate = -baseline.relation(player.id);
    return { player, hate: player.alive ? clamp(baselineHate + behaviorHate) : 0,
      behaviorHate, baselineHate, evidence };
  });
}

function objective(observation: Observation): string {
  switch (observation.self.role) {
    case 'lord': return '你是主公：保持主公存活，消灭全部反贼和内奸，与忠臣共同获胜。';
    case 'loyalist': return '你是忠臣：保护主公，协助消灭全部反贼和内奸；攻击或救援主公的行为也影响你对行动者的仇恨。';
    case 'rebel': return '你是反贼：击杀主公使反贼阵营获胜；其他反贼是盟友，别人主动攻击主公是友善证据。';
    case 'renegade': return '你是内奸：最终成为唯一存活者；先消灭其他角色再与主公单挑，主公过早死亡通常会让反贼获胜。根据局势平衡阵营。';
    default: return '你的身份尚未提供；根据公开信息判断各方，不猜测后台身份。';
  }
}

function facts(pair: PublicInteraction): string {
  return [pair.attacks ? `主动出杀${pair.attacks}次` : '', pair.damage ? `造成${pair.damage}点伤害` : '',
    pair.recovery ? `回复${pair.recovery}点体力` : '', pair.gifts ? `赠送${pair.gifts}张牌` : '',
    pair.disruption ? `使用${pair.disruption}次干扰` : '', pair.protection ?
      `无懈保护净${signed(pair.protection)}次（反制保护计负）` : ''].filter(Boolean).join('、');
}

export function modelIdentityContext(observation: Observation, named: (player: VisiblePlayer) => string): string[] {
  if (observation.mode.id !== 'identity') return [];
  const players = [observation.self, ...observation.others];
  return [
    '【身份目标】', objective(observation),
    '【各坐席仇恨（你的视角）】',
    '正数表示敌对，负数表示友善或潜在盟友，0表示证据不足。综合值范围为-5至+5；行为累计按整局公开行为统计，阵营基准只用你已知的身份与公开身份数量。未知身份的关系是推断，供你结合局势判断。',
    '主动出杀或每点伤害记1，命中的杀与伤害不重复计数；每点回复记-1；赠牌、干扰和无懈按半点计，再按其目标对你所属阵营的利害调整正负。',
    ...modelRelationships(observation).map(row => {
      if (row.player.id === observation.self.id) return `- ${named(row.player)}：你自己，仇恨0。`;
      if (!row.player.alive) return `- ${named(row.player)}：已阵亡，不参与当前目标选择。`;
      const evidence = row.evidence.filter(item => item.contribution !== 0)
        .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3).map(item => {
          const target = players.find(player => player.id === item.interaction.target);
          return target ? `对${named(target)}${facts(item.interaction)}，对你的仇恨贡献${signed(item.contribution)}` : '';
        }).filter(Boolean);
      return `- ${named(row.player)}：仇恨${signed(row.hate)}（行为累计${signed(row.behaviorHate)}，阵营基准${signed(row.baselineHate)}；` +
        `${row.hate > 0 ? '敌对倾向' : row.hate < 0 ? '友善倾向' : '信息不足'}）。` +
        (evidence.length ? `主要依据：${evidence.join('；')}。` : '暂无明确的公开行为依据。');
    }),
  ];
}

import type { Observation, VisiblePlayer } from '../../../../contracts.ts';
import { publicInteractions, type PublicInteraction } from './public-interactions.ts';
import { RelationshipModel } from './relationship-model.ts';

const clamp = (value: number) => Math.max(-5, Math.min(5, value));
const effect = (pair: PublicInteraction) => pair.damage + Math.max(0, pair.attacks - pair.attackHits) +
  pair.disruption * 0.5 - pair.recovery - pair.gifts * 0.5 - pair.protection * 0.5;

export interface PublicRelationship {
  player: VisiblePlayer;
  hate: number;
  behaviorHate: number;
  baselineHate: number;
  evidence: { interaction: PublicInteraction; importance: number; contribution: number }[];
}

/** Shared, bounded relationship evidence from public facts only. Negative hate means friendly. */
export function publicRelationships(observation: Observation): PublicRelationship[] {
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


import type { Observation, VisiblePlayer } from '../../contracts.ts';
import { publicInteractions } from '../domain/public-interactions.ts';

const clamp = (value: number, low = -1, high = 1) => Math.max(low, Math.min(high, value));

/** Fighting resources visible to every seat; neither identities nor hand contents are read. */
function strength(player: VisiblePlayer): number {
  const equipment = Object.entries(player.equip).reduce((sum, [slot, card]) => sum +
    (card ? slot === 'armor' ? 1.5 : slot === 'weapon' ? 1 : 0.75 : 0), 0);
  const delays = player.judge.filter(card => card.name === 'lebu' || card.name === 'bingliang').length;
  return Math.max(0.5, Math.max(0, player.hp) * 2 + Math.min(10, player.handCount) * 0.8 + equipment - delays);
}

/** Positive relationships support the weaker camp, subject to keeping the lord alive. */
export function renegadeRelations(observation: Observation): Map<number, number> {
  const players = [observation.self, ...observation.others];
  const living = players.filter(player => player.alive);
  const lord = living.find(player => player.role === 'lord');
  const thirdParties = living.filter(player => player.id !== observation.self.id && player.id !== lord?.id);
  const history = observation.publicInteractions ?? publicInteractions(observation.events,
    id => observation.eventCards?.[id]?.name);
  const evidence = (id: number) => {
    let alignment = 0, personal = 0;
    for (const pair of history) if (pair.source === id) {
      const target = players.find(player => player.id === pair.target);
      const side = target?.role === 'lord' || target?.role === 'loyalist' ? 1 : target?.role === 'rebel' ? -1 : 0;
      const hostility = pair.damage + Math.max(0, pair.attacks - pair.attackHits) * 0.4 + pair.disruption * 0.4 -
        pair.recovery - pair.gifts * 0.4 - pair.protection * 0.7;
      alignment -= side * hostility;
      if (pair.target === observation.self.id) personal -= Math.max(0, hostility) * 0.15;
    }
    return { alignment: clamp(alignment), personal: clamp(personal, -0.35, 0) };
  };
  const facts = new Map(thirdParties.map(player => [player.id, evidence(player.id)]));
  const unknown = thirdParties.filter(player => !player.role);
  // Allocate only probabilities, equally for indistinguishable seats. Public deaths constrain the quota.
  const quota = players.length === 5 ? 1 : players.length === 8 ? 2 : undefined;
  const remaining = quota === undefined ? unknown.length / 2 : clamp(quota -
    players.filter(player => player.role === 'loyalist').length, 0, unknown.length);
  const probability = (id: number, offset: number) => 1 / (1 + Math.exp(-offset - 3 * facts.get(id)!.alignment));
  let low = -30, high = 30;
  for (let i = 0; i < 32; i++) {
    const middle = (low + high) / 2;
    if (unknown.reduce((sum, player) => sum + probability(player.id, middle), 0) < remaining) low = middle;
    else high = middle;
  }
  const alignment = (player: VisiblePlayer) => player.role === 'loyalist' ? 1 : player.role === 'rebel' ? -1 :
    2 * (remaining === 0 ? 0 : remaining === unknown.length ? 1 : probability(player.id, (low + high) / 2)) - 1;
  let loyalPower = lord ? strength(lord) : 0, rebelPower = 0;
  for (const player of thirdParties) {
    const loyalChance = (alignment(player) + 1) / 2;
    loyalPower += strength(player) * loyalChance;
    rebelPower += strength(player) * (1 - loyalChance);
  }
  const balance = clamp(3 * (loyalPower - rebelPower) / Math.max(1, loyalPower + rebelPower));
  const pressure = lord ? clamp((3 - lord.hp) / 2 +
    (lord.handCount === 0 ? 0.15 : 0) + Math.max(0, -balance) * 0.3 +
    (lord.judge.some(card => card.name === 'lebu') ? 0.15 : 0), 0, 1) : 0;
  const average = thirdParties.reduce((sum, player) => sum + strength(player), 0) / Math.max(1, thirdParties.length);
  const relations = new Map<number, number>([[observation.self.id, 1]]);
  if (lord) relations.set(lord.id, thirdParties.length ? 0.55 + pressure * 0.45 : -1);
  for (const player of thirdParties) {
    const side = alignment(player);
    const resourcePressure = clamp((strength(player) - average) / Math.max(1, average)) * 0.12;
    const control = -0.22 - balance * side * 0.75 - resourcePressure;
    const protect = -0.25 + side * 0.75;
    relations.set(player.id, thirdParties.length === 1 ? -1 :
      clamp(control * (1 - pressure) + protect * pressure + facts.get(player.id)!.personal, -1, 0.65));
  }
  return relations;
}

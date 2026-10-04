import { GameEngine } from '../engine.ts';
import { RuleBasePolicy } from '../rule-base-policy.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { standardContent } from '../src/content/standard/content.ts';

const args = process.argv.slice(2);
const option = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const seeds = Number(option('--seeds') ?? 12);
const general = option('--general') ?? 'standard.sunquan';
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new Error('--seeds 必须在 1 到 1000 之间');
standardContent.general(general);

const strategic = new StrategicPolicy();
const baseline = new RuleBasePolicy();
const results = { strategicWins: 0, baselineWins: 0, draws: 0, unfinished: 0 };
for (let seed = 1; seed <= seeds; seed++) {
  for (const strategicSeat of [0, 1]) {
    const game = GameEngine.standard({ seed, players: [0, 1].map(id => ({
      label: `角色${id + 1}`, sex: 'male' as const, general,
    })) });
    let steps = 0;
    while (!game.finished && steps < 2000) {
      const decision = game.getDecision();
      if (!decision) break;
      const policy = decision.actor === strategicSeat ? strategic : baseline;
      game.choose(policy.choose(game.getObservation(decision.actor), decision));
      steps++;
    }
    const result = game.getObservation(strategicSeat).outcome;
    if (result.status === 'ongoing') results.unfinished++;
    else if (result.status === 'draw') results.draws++;
    else if (result.winners.includes(strategicSeat)) results.strategicWins++;
    else results.baselineWins++;
  }
}
process.stdout.write(JSON.stringify({ general, policyVersion: strategic.version, seeds, games: seeds * 2, ...results }, null, 2) + '\n');

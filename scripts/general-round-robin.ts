import { rulePolicyBaseline } from './rule-policy-source.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GameEngine } from '../engine.ts';
import { standardGeneralDefinitions } from '../src/content/standard/generals.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? '';
};
const gamesPerPair = Number(option('--games', '30'));
const seedStart = Number(option('--seed-start', '1'));
const stepLimit = Number(option('--step-limit', '5000'));
const output = resolve(option('--output', './traces/general-round-robin.json'));
if (!Number.isInteger(gamesPerPair) || gamesPerPair < 2 || gamesPerPair % 2 !== 0) {
  throw new Error('--games 必须是大于 0 的偶数，以便平衡先后手');
}
if (!Number.isInteger(seedStart) || seedStart < 0 || seedStart > 0xffffffff - gamesPerPair / 2) {
  throw new Error('--seed-start 必须是有效的 32 位非负整数');
}
if (!Number.isInteger(stepLimit) || stepLimit < 1) throw new Error('--step-limit 必须是正整数');

const generals = [...standardGeneralDefinitions].sort((a, b) => a.id.localeCompare(b.id));
const policy = new StrategicPolicy();
type Result = { a: string; b: string; seed: number; aSeat: number; winner: string | null;
  status: 'finished' | 'draw' | 'unfinished'; steps: number; reason?: string };
const results: Result[] = [];
const total = generals.length * (generals.length - 1) / 2 * gamesPerPair;

function save(): void {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({
    policy: 'StrategicPolicy', policySource: rulePolicyBaseline, mode: 'duel', generals: generals.map(({ id, label }) => ({ id, label })),
    gamesPerPair, seedStart, stepLimit, total, completed: results.length, results,
  }, null, 2) + '\n');
}

for (let i = 0; i < generals.length; i++) {
  for (let j = i + 1; j < generals.length; j++) {
    const a = generals[i];
    const b = generals[j];
    for (let offset = 0; offset < gamesPerPair / 2; offset++) {
      const seed = seedStart + offset;
      for (const aSeat of [0, 1]) {
        const seated = aSeat === 0 ? [a, b] : [b, a];
        const game = GameEngine.standard({ seed, mode: 'duel', players: seated.map(general => ({
          label: general.label, sex: general.sex ?? 'male', general: general.id,
        })) });
        let steps = 0;
        while (!game.finished && steps < stepLimit) {
          const decision = game.getDecision();
          if (!decision) break;
          game.choose(policy.choose(game.getObservation(decision.actor), decision));
          steps++;
        }
        const outcome = game.getObservation(0).outcome;
        results.push({ a: a.id, b: b.id, seed, aSeat,
          winner: outcome.status === 'finished' ? seated[outcome.winners[0]].id : null,
          status: outcome.status === 'ongoing' ? 'unfinished' : outcome.status,
          steps, ...('reason' in outcome ? { reason: outcome.reason } : {}),
        });
      }
    }
    save();
    process.stderr.write(`${results.length}/${total} games complete\n`);
  }
}
process.stdout.write(`${output}\n`);

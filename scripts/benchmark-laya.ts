import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GameEngine } from '../engine.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { LayaPolicy } from '../src/policies/laya-policy.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { RULE_POLICY_VERSION } from '../src/policies/rule-policy-version.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? '';
};
const generalIds = option('--generals', 'standard.ganning,standard.sunquan,standard.zhaoyun,standard.zhangliao,standard.huatuo').split(',');
const games = Number(option('--games', '100'));
const seedStart = Number(option('--seed-start', '1'));
const stepLimit = Number(option('--step-limit', '1000'));
const output = resolve(option('--output', './traces/laya-vs-rule-100.json'));
if (generalIds.length === 0 || new Set(generalIds).size !== generalIds.length) throw new Error('武将列表不能为空或重复');
if (!Number.isInteger(games) || games < 2 || games % (generalIds.length * 2) !== 0) {
  throw new Error('--games 必须能被武将数 × 2 整除，以平衡武将、种子和座位');
}
if (!Number.isInteger(seedStart) || seedStart < 0 || seedStart > 0xffffffff - games / (generalIds.length * 2)) {
  throw new Error('--seed-start 必须是有效的 32 位非负整数');
}
if (!Number.isInteger(stepLimit) || stepLimit < 1) throw new Error('--step-limit 必须是正整数');

const generals = generalIds.map(id => standardContent.general(id));
const seedsPerGeneral = games / (generals.length * 2);
const laya = new LayaPolicy({ timeoutMs: 180_000 });
const rule = new StrategicPolicy();
type Result = { general: string; seed: number; layaSeat: number; status: 'finished' | 'draw' | 'unfinished' | 'error';
  winner: 'laya' | 'rule' | null; steps: number; layaDecisions: number; elapsedMs: number; reason?: string; error?: string };
const results: Result[] = [];
const startedAt = new Date().toISOString();

function save(): void {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({
    model: 'laya multilingual', baseline: `StrategicPolicy ${RULE_POLICY_VERSION}`, mode: 'duel', labels: 'seat', startedAt,
    games, seedsPerGeneral, seedStart, stepLimit,
    generals: generals.map(({ id, label }) => ({ id, label })),
    completed: results.length, results,
  }, null, 2) + '\n');
}

for (const general of generals) {
  for (let offset = 0; offset < seedsPerGeneral; offset++) {
    const seed = seedStart + offset;
    for (const layaSeat of [0, 1]) {
      const game = GameEngine.standard({ seed, mode: 'duel', players: [0, 1].map(id => ({
        label: `座位${id + 1}·${general.label}`, sex: general.sex ?? 'male', general: general.id,
      })) });
      const start = performance.now();
      let steps = 0;
      let layaDecisions = 0;
      let failure: string | undefined;
      try {
        while (!game.finished && steps < stepLimit) {
          const decision = game.getDecision();
          if (!decision?.id) throw new Error('对局未结束但没有可提交的决策');
          const observation = game.getObservation(decision.actor);
          const isLaya = decision.actor === layaSeat;
          const optionId = isLaya ? await laya.choose(observation, decision) : rule.choose(observation, decision);
          if (isLaya) layaDecisions++;
          game.choose({ decisionId: decision.id, optionId });
          steps++;
        }
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      const outcome = game.getObservation(0).outcome;
      const status = failure ? 'error' : outcome.status === 'ongoing' ? 'unfinished' : outcome.status;
      const winner = status === 'finished' ? outcome.winners.includes(layaSeat) ? 'laya' : 'rule' : null;
      results.push({ general: general.id, seed, layaSeat, status, winner, steps, layaDecisions,
        elapsedMs: Math.round(performance.now() - start),
        ...('reason' in outcome ? { reason: outcome.reason } : {}), ...(failure ? { error: failure } : {}),
      });
      save();
      process.stderr.write(`${results.length}/${games} ${general.label} seed=${seed} Laya座位=${layaSeat} ${status} ${winner ?? failure ?? ''} ${steps}步\n`);
    }
  }
}
process.stdout.write(`${output}\n`);

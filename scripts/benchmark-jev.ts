import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ChineseView } from '../chinese-view.ts';
import { GameEngine } from '../engine.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { JevPolicy } from '../src/policies/jev-policy.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { RULE_POLICY_VERSION } from '../src/policies/rule-policy-version.ts';

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? '';
}

const generalIds = option('--generals',
  'standard.ganning,standard.sunquan,standard.zhaoyun,standard.zhangliao,standard.huatuo').split(',');
const games = Number(option('--games', '50'));
const seedStart = Number(option('--seed-start', '1'));
const stepLimit = Number(option('--step-limit', '300'));
const output = resolve(option('--output', './traces/jev-vs-rule-50.json'));
if (!generalIds.length || new Set(generalIds).size !== generalIds.length) {
  throw new Error('--generals 不能为空或包含重复武将');
}
if (!Number.isInteger(games) || games < 2 || games % (generalIds.length * 2) !== 0) {
  throw new Error('--games 必须能被武将数 × 2 整除');
}
if (!Number.isInteger(seedStart) || seedStart < 0 || seedStart > 0xffffffff - games / (generalIds.length * 2)) {
  throw new Error('--seed-start 必须是有效的 32 位非负整数');
}
if (!Number.isInteger(stepLimit) || stepLimit < 1) throw new Error('--step-limit 必须是正整数');

const generals = generalIds.map(id => standardContent.general(id));
const seedsPerGeneral = games / (generals.length * 2);
type Result = { general: string; seed: number; jevSeat: number; status: 'finished' | 'draw' | 'unfinished';
  winner: 'jev' | 'rule' | null; steps: number; jevDecisions: number; elapsedMs: number;
  optionIds?: string[]; reason?: string };
type Progress = { key: string; optionIds: string[]; startedAt: string };
type Report = { modelRequested: string; modelObserved: string[]; baseline: string; mode: string;
  labels: string; startedAt: string; games: number; seedsPerGeneral: number; seedStart: number;
  stepLimit: number; generals: { id: string; label: string }[]; completed: number;
  usage: { calls: number; inputTokens: number; outputTokens: number }; results: Result[]; progress: Progress | null };

const config = {
  modelRequested: 'jev-latest', baseline: `StrategicPolicy ${RULE_POLICY_VERSION}`, mode: 'duel', labels: 'seat',
  games, seedsPerGeneral, seedStart, stepLimit,
  generals: generals.map(({ id, label }) => ({ id, label })),
};
const report: Report = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) as Report : {
  ...config, modelObserved: [], startedAt: new Date().toISOString(), completed: 0,
  usage: { calls: 0, inputTokens: 0, outputTokens: 0 }, results: [], progress: null,
};
for (const key of Object.keys(config) as (keyof typeof config)[]) {
  if (JSON.stringify(report[key]) !== JSON.stringify(config[key])) {
    throw new Error(`已有结果的 ${key} 与本次参数不一致，请换用新的 --output`);
  }
}
if (report.completed !== report.results.length) throw new Error('已有结果的完成局数不一致');

process.umask(0o077);
function save(): void {
  mkdirSync(dirname(output), { recursive: true });
  const temp = `${output}.tmp`;
  writeFileSync(temp, JSON.stringify(report, null, 2) + '\n');
  renameSync(temp, output);
}

const monitoredFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);
  if (response.ok) {
    try {
      const data = await response.clone().json() as { model?: string;
        usage?: { input_tokens?: number; output_tokens?: number } };
      report.usage.calls++;
      report.usage.inputTokens += data.usage?.input_tokens ?? 0;
      report.usage.outputTokens += data.usage?.output_tokens ?? 0;
      if (data.model && !report.modelObserved.includes(data.model)) report.modelObserved.push(data.model);
    } catch { /* JevPolicy reports malformed responses. */ }
  }
  return response;
};
const jev = new JevPolicy({ fetcher: monitoredFetch, timeoutMs: 60_000 });
const rule = new StrategicPolicy();
const view = new ChineseView();

for (const general of generals) {
  for (let offset = 0; offset < seedsPerGeneral; offset++) {
    const seed = seedStart + offset;
    for (const jevSeat of [0, 1]) {
      const key = `${general.id}:${seed}:${jevSeat}`;
      if (report.results.some(row => `${row.general}:${row.seed}:${row.jevSeat}` === key)) continue;
      if (report.progress && report.progress.key !== key) throw new Error('已有其他对局的未完成进度');
      const game = GameEngine.standard({ seed, mode: 'duel', players: [0, 1].map(id => ({
        label: `座位${id + 1}·${general.label}`, sex: general.sex ?? 'male', general: general.id,
      })) });
      report.progress ??= { key, optionIds: [], startedAt: new Date().toISOString() };
      const seen = new Map<string, number>();
      let jevDecisions = 0;
      function fingerprint(): string {
        const decision = game.getDecision();
        if (!decision) throw new Error('对局未结束但没有可提交的决策');
        const choices = view.choiceSet(game.getObservation(decision.actor), decision);
        return JSON.stringify([decision.actor, choices.state, choices.criteria]);
      }
      for (const optionId of report.progress.optionIds) {
        if (game.finished) throw new Error('存档中包含终局后的行动');
        const mark = fingerprint();
        seen.set(mark, (seen.get(mark) ?? 0) + 1);
        const decision = game.getDecision()!;
        if (decision.actor === jevSeat) jevDecisions++;
        game.choose({ decisionId: decision.id!, optionId });
      }
      let reason: string | undefined;
      while (!game.finished && report.progress.optionIds.length < stepLimit) {
        const mark = fingerprint();
        if ((seen.get(mark) ?? 0) >= 3) {
          reason = '同一请求已重复3次';
          break;
        }
        seen.set(mark, (seen.get(mark) ?? 0) + 1);
        const decision = game.getDecision()!;
        const observation = game.getObservation(decision.actor);
        const isJev = decision.actor === jevSeat;
        const optionId = isJev ? await jev.choose(observation, decision) : rule.choose(observation, decision);
        game.choose({ decisionId: decision.id!, optionId });
        if (isJev) jevDecisions++;
        report.progress.optionIds.push(optionId);
        save();
      }
      const outcome = game.getObservation(0).outcome;
      const status = outcome.status === 'ongoing' ? 'unfinished' : outcome.status;
      const winner = status === 'finished' ? outcome.winners.includes(jevSeat) ? 'jev' : 'rule' : null;
      report.results.push({ general: general.id, seed, jevSeat, status, winner,
        steps: report.progress.optionIds.length, jevDecisions,
        optionIds: [...report.progress.optionIds],
        elapsedMs: Date.now() - Date.parse(report.progress.startedAt),
        ...(reason ? { reason } : status === 'unfinished' ? { reason: `达到${stepLimit}步上限` } :
          'reason' in outcome ? { reason: outcome.reason } : {}),
      });
      report.completed = report.results.length;
      report.progress = null;
      save();
      process.stderr.write(`${report.completed}/${games} ${general.label} seed=${seed} Jev座位=${jevSeat} ${status} ${winner ?? reason ?? ''} ${report.results.at(-1)!.steps}步\n`);
    }
  }
}
process.stdout.write(`${output}\n`);

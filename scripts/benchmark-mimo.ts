import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ChineseView } from '../chinese-view.ts';
import { GameEngine } from '../engine.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { MimoPolicy, MimoOutputError, type MimoModel, type MimoResponseInfo } from '../src/policies/mimo-policy.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { rulePolicyBaseline } from './rule-policy-source.ts';

const args = process.argv.slice(2);
function option(name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? '';
}
const games = Number(option('--games', '10'));
const seedStart = Number(option('--seed-start', '1'));
const stepLimit = Number(option('--step-limit', '300'));
const generalId = option('--general', 'standard.ganning');
const modelId = option('--model', 'mimo-v2.6-flash');
if (modelId !== 'mimo-v2.6-flash' && modelId !== 'mimo-v2.6-pro') throw new Error('--model 只支持 mimo-v2.6-flash 或 mimo-v2.6-pro');
const output = resolve(option('--output', './traces/mimo-ganning-vs-rule-10.json'));
const rawOutput = resolve(option('--raw-output', output.replace(/\.json$/, '.exchanges.jsonl')));
if (rawOutput === output) throw new Error('原始响应文件不能与结果文件相同');
if (!Number.isInteger(games) || games < 2 || games % 2) throw new Error('--games 必须是正偶数');
if (!Number.isInteger(seedStart) || seedStart < 0 || seedStart > 0xffffffff - games / 2) throw new Error('--seed-start 无效');
if (!Number.isInteger(stepLimit) || stepLimit < 1) throw new Error('--step-limit 必须是正整数');
const general = standardContent.general(generalId);

async function readKey(): Promise<string> {
  if (!args.includes('--key-stdin')) return (process.env.MIMO_API_KEY ?? '').trim();
  return new Promise((resolve, reject) => {
    process.stdin.once('data', chunk => {
      process.stdin.pause();
      const key = String(chunk).trim();
      if (!key) reject(new Error('标准输入没有 MiMo API Key'));
      else resolve(key);
    });
    process.stdin.once('error', reject);
    process.stdin.resume();
  });
}

interface ModelAction { step: number; choice: string; optionId: string; model?: string;
  promptTokens: number; completionTokens: number; reasoningTokens: number }
interface Result { seed: number; mimoSeat: number; status: 'finished' | 'draw' | 'unfinished' | 'forfeit';
  winner: 'mimo' | 'rule' | null; steps: number; modelDecisions: number; modelCalls: number;
  elapsedMs: number; optionIds: string[]; modelActions: ModelAction[]; reason?: string }
interface Progress { key: string; optionIds: string[]; modelActions: ModelAction[]; startedAt: string }
interface Report { modelRequested: string; modelObserved: string[]; baseline: string; mode: string;
  general: { id: string; label: string }; startedAt: string; games: number; seedStart: number;
  stepLimit: number; rawOutput: string; completed: number;
  usage: { calls: number; promptTokens: number; completionTokens: number; reasoningTokens: number };
  results: Result[]; progress: Progress | null }
const config = { modelRequested: `${modelId} (thinking=enabled)`,
  baseline: rulePolicyBaseline, mode: 'duel', general: { id: general.id, label: general.label },
  games, seedStart, stepLimit, rawOutput };
const report: Report = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) as Report : {
  ...config, modelObserved: [], startedAt: new Date().toISOString(), completed: 0,
  usage: { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 },
  results: [], progress: null,
};
for (const key of Object.keys(config) as (keyof typeof config)[]) {
  if (JSON.stringify(report[key]) !== JSON.stringify(config[key])) throw new Error(`已有结果的 ${key} 与本次参数不一致`);
}
if (report.completed !== report.results.length) throw new Error('已有结果的完成局数不一致');
process.umask(0o077);
function save(): void {
  mkdirSync(dirname(output), { recursive: true });
  const temp = `${output}.tmp`;
  writeFileSync(temp, JSON.stringify(report, null, 2) + '\n');
  renameSync(temp, output);
}
const key = await readKey();
if (!key) throw new Error('缺少 MIMO_API_KEY 或 --key-stdin');
let pendingAction: MimoResponseInfo | null = null;
let currentRequest: { seed: number; mimoSeat: number; step: number } | null = null;
mkdirSync(dirname(rawOutput), { recursive: true });
const model = new MimoPolicy({ apiKey: key, model: modelId as MimoModel, onResponse(info) { pendingAction = info; },
  onExchange(exchange) {
    if (!currentRequest) throw new Error('缺少模型请求的对局定位信息');
    appendFileSync(rawOutput, JSON.stringify({ ...currentRequest, ...exchange }) + '\n', { mode: 0o600 });
  } });
const rule = new StrategicPolicy();
const view = new ChineseView();
process.stderr.write(`开始 ${games} 局 ${general.label} 镜像赛，结果写入 ${output}\n`);
for (let offset = 0; offset < games / 2; offset++) {
  const seed = seedStart + offset;
  for (const mimoSeat of [0, 1]) {
    const gameKey = `${seed}:${mimoSeat}`;
    if (report.results.some(row => `${row.seed}:${row.mimoSeat}` === gameKey)) continue;
    if (report.progress && report.progress.key !== gameKey) throw new Error('已有其他对局的未完成进度');
    const game = GameEngine.standard({ seed, mode: 'duel', players: [0, 1].map(id => ({
      label: `座位${id + 1}·${general.label}`, sex: general.sex ?? 'male', general: general.id,
    })) });
    report.progress ??= { key: gameKey, optionIds: [], modelActions: [], startedAt: new Date().toISOString() };
    const progress = report.progress;
    const seen = new Map<string, number>();
    let modelDecisions = 0;
    function fingerprint(): string {
      const decision = game.getDecision();
      if (!decision) throw new Error('对局未结束但没有决策');
      const choices = view.choiceSet(game.getObservation(decision.actor), decision);
      return JSON.stringify([decision.actor, choices.state, choices.criteria]);
    }
    for (const optionId of progress.optionIds) {
      if (game.finished) throw new Error('存档中包含终局后的行动');
      const mark = fingerprint();
      seen.set(mark, (seen.get(mark) ?? 0) + 1);
      const decision = game.getDecision()!;
      if (decision.actor === mimoSeat) modelDecisions++;
      game.choose({ decisionId: decision.id!, optionId });
    }
    let reason: string | undefined;
    let forfeited = false;
    while (!game.finished && progress.optionIds.length < stepLimit) {
      const mark = fingerprint();
      if ((seen.get(mark) ?? 0) >= 3) { reason = '同一公开请求已重复3次'; break; }
      seen.set(mark, (seen.get(mark) ?? 0) + 1);
      const decision = game.getDecision()!;
      const observation = game.getObservation(decision.actor);
      const isModel = decision.actor === mimoSeat;
      pendingAction = null;
      currentRequest = isModel ? { seed, mimoSeat, step: progress.optionIds.length } : null;
      const choices = isModel ? view.choiceSet(observation, decision) : null;
      let optionId: string;
      try {
        optionId = isModel && Object.keys(choices!.criteria).length === 1
          ? choices!.resolve(Object.keys(choices!.criteria)[0]).id
          : isModel ? await model.choose(observation, decision) : rule.choose(observation, decision);
      } catch (error) {
        if (!(error instanceof MimoOutputError)) throw error;
        reason = error.message;
        forfeited = true;
        break;
      }
      game.choose({ decisionId: decision.id!, optionId });
      if (isModel) {
        modelDecisions++;
        if (pendingAction) {
          const info: MimoResponseInfo = pendingAction;
          progress.modelActions.push({ step: progress.optionIds.length, choice: info.choice,
            optionId: info.optionId, model: info.model, promptTokens: info.promptTokens,
            completionTokens: info.completionTokens, reasoningTokens: info.reasoningTokens });
          report.usage.calls++;
          report.usage.promptTokens += info.promptTokens;
          report.usage.completionTokens += info.completionTokens;
          report.usage.reasoningTokens += info.reasoningTokens;
          if (info.model && !report.modelObserved.includes(info.model)) report.modelObserved.push(info.model);
          if (report.usage.calls % 10 === 0) process.stderr.write(`已请求模型 ${report.usage.calls} 次；当前第 ${report.completed + 1} 局，第 ${progress.optionIds.length + 1} 步\n`);
        }
      }
      progress.optionIds.push(optionId);
      save();
    }
    const outcome = game.getObservation(0).outcome;
    const status = forfeited ? 'forfeit' : outcome.status === 'ongoing' ? 'unfinished' : outcome.status;
    const winner = status === 'forfeit' ? 'rule' : status === 'finished' ? outcome.winners.includes(mimoSeat) ? 'mimo' : 'rule' : null;
    report.results.push({ seed, mimoSeat, status, winner, steps: progress.optionIds.length,
      modelDecisions, modelCalls: progress.modelActions.length, optionIds: [...progress.optionIds],
      modelActions: [...progress.modelActions], elapsedMs: Date.now() - Date.parse(progress.startedAt),
      ...(reason ? { reason } : status === 'unfinished' ? { reason: `达到${stepLimit}步上限` } :
        'reason' in outcome ? { reason: outcome.reason } : {}),
    });
    report.completed = report.results.length;
    report.progress = null;
    save();
    process.stderr.write(`${report.completed}/${games} seed=${seed} MiMo座位=${mimoSeat + 1} ${status} ${winner ?? reason ?? ''} ${report.results.at(-1)!.steps}步 ${report.results.at(-1)!.modelCalls}次模型调用\n`);
  }
}
process.stdout.write(`${output}\n`);

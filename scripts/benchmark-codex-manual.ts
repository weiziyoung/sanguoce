import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { cardText } from '../catalog.ts';
import { ChineseView } from '../chinese-view.ts';
import { GameEngine } from '../engine.ts';
import { forcedActionId } from '../src/domain/forced-choice.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { RULE_POLICY_VERSION } from '../src/policies/rule-policy-version.ts';

const output = resolve(process.argv[2] ?? './datasets/codex-ganning-2026-09-27/results.json');
const general = 'standard.ganning';
const stepLimit = 300;
type OwnDecision = { step: number; state: string; options: { id: string; label: string }[];
  selected: string; reason: string };
type GameRecord = { seed: number; codexSeat: number; optionIds: string[]; ownDecisions: OwnDecision[];
  status: 'ongoing' | 'finished' | 'draw' | 'unfinished'; winner: 'codex' | 'rule' | null;
  reason?: string; steps?: number };
type Report = { method: string; general: string; baseline: string; stepLimit: number;
  startedAt: string; games: GameRecord[] };
const config = { method: 'Codex manual public-observation decisions; paired seed and swapped seat',
  general, baseline: `StrategicPolicy ${RULE_POLICY_VERSION}`, stepLimit };
const report: Report = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) as Report : {
  ...config, startedAt: new Date().toISOString(),
  games: Array.from({ length: 5 }, (_, offset) => [0, 1].map(codexSeat => ({
    seed: offset + 1, codexSeat, optionIds: [], ownDecisions: [],
    status: 'ongoing' as const, winner: null,
  }))).flat(),
};
for (const key of Object.keys(config) as (keyof typeof config)[]) {
  if (report[key] !== config[key]) throw new Error(`报告配置不匹配：${key}`);
}
function save(): void {
  mkdirSync(dirname(output), { recursive: true });
  const temp = `${output}.tmp`;
  writeFileSync(temp, JSON.stringify(report, null, 2) + '\n');
  renameSync(temp, output);
}
const view = new ChineseView();
const rule = new StrategicPolicy();
const sessions = report.games.map(record => {
  const game = GameEngine.standard({ seed: record.seed, mode: 'duel', players: [0, 1].map(id => ({
    label: `座位${id + 1}·甘宁`, sex: 'male' as const, general,
  })) });
  for (const optionId of record.optionIds) {
    const decision = game.getDecision();
    if (!decision?.id) throw new Error('存档包含终局后的行动');
    game.choose({ decisionId: decision.id, optionId });
  }
  return { record, game };
});
type Pending = { key: string; seed: number; seat: number; step: number; turn: number;
  phase: string; title: string; hp: string; hands: string; equipment: string;
  recent: string[]; options: { index: number; label: string }[];
  choices: { id: string; label: string }[]; state: string };
function finish(record: GameRecord, game: typeof sessions[number]['game'], reason?: string): void {
  const outcome = game.getObservation(0).outcome;
  record.status = outcome.status === 'ongoing' ? 'unfinished' : outcome.status;
  record.winner = record.status === 'finished'
    ? outcome.winners.includes(record.codexSeat) ? 'codex' : 'rule' : null;
  record.steps = record.optionIds.length;
  record.reason = reason ?? ('reason' in outcome ? outcome.reason : undefined);
  save();
}
function pendingFor(record: GameRecord, game: typeof sessions[number]['game']): Pending | null {
  while (record.status === 'ongoing') {
    if (game.finished) { finish(record, game); return null; }
    if (record.optionIds.length >= stepLimit) { finish(record, game, '达到300步上限'); return null; }
    const decision = game.getDecision();
    if (!decision?.id) throw new Error('未结束对局缺少决策');
    const observation = game.getObservation(decision.actor);
    const forced = forcedActionId(decision);
    if (forced !== null || decision.actor !== record.codexSeat) {
      const optionId = forced ?? rule.choose(observation, decision);
      game.choose({ decisionId: decision.id, optionId });
      record.optionIds.push(optionId);
      save();
      continue;
    }
    const choiceSet = view.choiceSet(observation, decision);
    const choices = [...choiceSet.map].map(([, choice], index) => ({
      id: choice.id, label: Object.values(choiceSet.criteria)[index],
    }));
    const self = observation.self;
    const other = observation.others[0];
    const equipped = (player: typeof self) => Object.values(player.equip)
      .filter(card => card !== null).map(card => cardText(card!)).join('、') || '无';
    return {
      key: `${record.seed}:${record.codexSeat}`, seed: record.seed, seat: record.codexSeat,
      step: record.optionIds.length, turn: observation.turn, phase: observation.phase,
      title: decision.title,
      hp: `我${self.hp}/${self.maxHp} 对手${other.hp}/${other.maxHp}`,
      hands: `我${self.hand.map(cardText).join('、') || '无'} 对手${other.handCount}张`,
      equipment: `我${equipped(self)} 对手${equipped(other)}`,
      recent: observation.log.slice(-5),
      options: choices.map(({ label }, index) => ({ index: index + 1, label })),
      choices, state: choiceSet.state,
    };
  }
  return null;
}
const input = readline.createInterface({ input: stdin, crlfDelay: Infinity });
const lines = input[Symbol.asyncIterator]();
for (;;) {
  const first = sessions.findIndex(({ record }) => record.status === 'ongoing');
  if (first < 0) break;
  const seed = sessions[first].record.seed;
  const pending = sessions.filter(({ record }) => record.seed === seed)
    .map(({ record, game }) => pendingFor(record, game)).filter((item): item is Pending => item !== null);
  if (!pending.length) continue;
  stdout.write(JSON.stringify({ pending: pending.map(({ choices: _choices, state: _state, ...item }) => item) }) + '\n');
  let accepted = false;
  for (;;) {
    const next = await lines.next();
    if (next.done) break;
    let answers: { key: string; index: number; reason: string }[];
    try {
      answers = JSON.parse(next.value) as typeof answers;
      if (!Array.isArray(answers) || answers.length !== pending.length) throw new Error('答案数不匹配');
      for (const [position, answer] of answers.entries()) {
        if (answer.key !== pending[position].key || !Number.isInteger(answer.index) ||
          !pending[position].choices[answer.index - 1] || typeof answer.reason !== 'string') {
          throw new Error(`答案 ${position + 1} 无效`);
        }
      }
    } catch (error) { stdout.write(JSON.stringify({ error: String(error) }) + '\n'); continue; }
    for (const [position, answer] of answers.entries()) {
      const item = pending[position];
      const session = sessions.find(({ record }) => `${record.seed}:${record.codexSeat}` === item.key)!;
      const decision = session.game.getDecision()!;
      const chosen = item.choices[answer.index - 1];
      session.game.choose({ decisionId: decision.id!, optionId: chosen.id });
      session.record.optionIds.push(chosen.id);
      session.record.ownDecisions.push({ step: item.step, state: item.state,
        options: item.choices, selected: chosen.id, reason: answer.reason });
      save();
    }
    accepted = true;
    break;
  }
  if (!accepted) break;
}
input.close();
stdout.write(JSON.stringify({ completed: report.games.filter(game => game.status !== 'ongoing').length,
  results: report.games.map(({ seed, codexSeat, status, winner, steps, reason }) =>
    ({ seed, codexSeat, status, winner, steps, reason })), output }) + '\n');

import { rulePolicyBaseline } from './rule-policy-source.ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ChineseView } from '../chinese-view.ts';
import { GameEngine } from '../engine.ts';
import { standardContent } from '../src/content/standard/content.ts';
import { LayaPolicy } from '../src/policies/laya-policy.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1] ?? '';
};
const general = standardContent.general(option('--general', 'standard.ganning'));
const opponent = standardContent.general(option('--opponent-general', general.id));
const seed = Number(option('--seed', '1'));
const layaSeat = Number(option('--laya-seat', '0'));
const stepLimit = Number(option('--steps', '200'));
const labels = option('--labels', 'seat');
const replayFile = option('--replay-file', '');
const replayUntil = Number(option('--replay-until', '0'));
const output = resolve(option('--output', './traces/laya-diagnosis.json'));
if (!Number.isInteger(seed) || ![0, 1].includes(layaSeat) || !Number.isInteger(stepLimit) || stepLimit < 1 ||
    !['seat', 'same'].includes(labels) || !Number.isInteger(replayUntil) || replayUntil < 0 || replayUntil >= stepLimit ||
    (replayUntil > 0 && !replayFile)) {
  throw new Error('参数无效');
}
const replay = replayFile ? JSON.parse(readFileSync(resolve(replayFile), 'utf8')) as {
  general: string; seed: number; layaSeat: number; labels: string;
  decisions: { selected: string }[];
} : null;
if (replay && (replay.general !== general.id || replay.seed !== seed || replay.layaSeat !== layaSeat ||
    replay.decisions.length < replayUntil)) {
  throw new Error('复盘文件与当前对局参数不一致');
}
const seated = [0, 1].map(id => id === layaSeat ? general : opponent);
const game = GameEngine.standard({ seed, mode: 'duel', players: seated.map((definition, id) => ({
  label: labels === 'seat' ? `座位${id + 1}·${definition.label}` : definition.label,
  sex: definition.sex ?? 'male', general: definition.id,
})) });
const view = new ChineseView();
const laya = new LayaPolicy();
const rule = new StrategicPolicy();
const decisions: unknown[] = [];
let steps = 0;
const comparableLabel = (value: string): string => {
  let normalized = value.replace(/（[^（）]*。）$/u, '');
  for (const definition of seated) normalized = normalized.replaceAll(definition.label, general.label);
  for (const id of [0, 1]) normalized = normalized.replaceAll(`座位${id + 1}·`, '');
  return normalized;
};

while (!game.finished && steps < stepLimit) {
  const decision = game.getDecision();
  if (!decision?.id) throw new Error('对局未结束但没有决策');
  const observation = game.getObservation(decision.actor);
  const choices = view.choiceSet(observation, decision);
  const isLaya = decision.actor === layaSeat;
  const ranks = isLaya ? rule.rank(observation, decision) : [];
  const oldSelection = steps < replayUntil ? replay!.decisions[steps].selected : null;
  const replayChoice = oldSelection ? [...choices.map].find(([key]) =>
    comparableLabel(choices.criteria[key]) === comparableLabel(oldSelection)) : null;
  if (oldSelection && !replayChoice) throw new Error(`第${steps + 1}步找不到原选择：${oldSelection}`);
  const optionId = replayChoice ? replayChoice[1].id :
    isLaya ? await laya.choose(observation, decision) : rule.choose(observation, decision);
  const chosen = [...choices.map].find(([, choice]) => choice.id === optionId);
  if (!chosen) throw new Error('策略返回了无效选择');
  const ownHp = observation.self.hp;
  const otherHp = observation.others[0].hp;
  decisions.push({ step: steps + 1, actor: decision.actor, policy: replayChoice ? 'replay' : isLaya ? 'laya' : 'rule',
    turn: observation.turn, phase: observation.phase, kind: decision.kind, title: decision.title,
    ownHp, otherHp, ownHand: observation.self.hand.length, otherHand: observation.others[0].handCount,
    candidates: choices.map.size, selected: choices.criteria[chosen[0]],
    ...(isLaya ? { ruleTop: ranks[0], chosenRank: ranks.findIndex(row => row.id === optionId) + 1,
      modelState: choices.state, criteria: choices.criteria } : {}),
  });
  game.choose({ decisionId: decision.id, optionId });
  steps++;
}
const outcome = game.getObservation(0).outcome;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify({ rulePolicySource: rulePolicyBaseline, general: general.id, opponentGeneral: opponent.id,
  seed, layaSeat, labels, replayUntil, stepLimit, steps,
  outcome, decisions }, null, 2) + '\n');
process.stdout.write(`${output}\n`);

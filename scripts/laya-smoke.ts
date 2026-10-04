import { GameEngine } from '../engine.ts';
import { ChineseView } from '../chinese-view.ts';
import { LayaPolicy } from '../src/policies/laya-policy.ts';

const game = GameEngine.standard({ seed: 1, mode: 'duel', players: [
  { label: '甘宁', sex: 'male', general: 'standard.ganning' },
  { label: '孙权', sex: 'male', general: 'standard.sunquan' },
] });
const decision = game.getDecision();
if (!decision?.id) throw new Error('未获得开局决策');
const observation = game.getObservation(decision.actor);
const optionId = await new LayaPolicy({ timeoutMs: 600_000 }).choose(observation, decision);
const selected = game.getLegalActions().find(option => option.id === optionId);
if (!selected) throw new Error('Laya 返回的动作不在规则引擎的合法动作中');
const choices = new ChineseView().choiceSet(observation, decision);
const key = [...choices.map].find(([, option]) => option.id === optionId)?.[0];
game.choose({ decisionId: decision.id, optionId });
console.log(`Laya 本地验证成功：甘宁选择「${key ? choices.criteria[key] : selected.label}」；已由规则引擎接受。`);

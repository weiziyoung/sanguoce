import { GameEngine } from '../engine.ts';
import { JevPolicy } from '../src/policies/jev-policy.ts';

const game = GameEngine.standard({ seed: 1, mode: 'duel', players: [
  { label: '甘宁', sex: 'male', general: 'standard.ganning' },
  { label: '孙权', sex: 'male', general: 'standard.sunquan' },
] });
const decision = game.getDecision();
if (!decision?.id) throw new Error('未获得开局决策');
const optionId = await new JevPolicy().choose(game.getObservation(decision.actor), decision);
const selected = game.getLegalActions().find(option => option.id === optionId);
if (!selected) throw new Error('Jev 返回的动作不在规则引擎的合法动作中');
game.choose({ decisionId: decision.id, optionId });
console.log(`Jev 连通性验证成功：甘宁选择「${selected.label}」；已由规则引擎接受。`);

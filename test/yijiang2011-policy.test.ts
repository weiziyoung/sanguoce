import test from 'node:test';
import assert from 'node:assert/strict';
import { yijiangScene as scene } from './support/yijiang2011-scenario.ts';
import { StrategicPolicy } from '../src/policies/strategic-policy.ts';
import { EvaluationContext } from '../src/policies/evaluation-context.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import type { GameState } from '../src/domain/state.ts';
const policy=new StrategicPolicy();
const choose=(s:GameState)=>legalActions(s).find(o=>o.id===policy.choose(observe(s,decision(s)!.actor),decision(s)!))!.data!;
test('AI不对空防具于禁浪费黑杀，红杀仍有价值',()=>{
  const x=scene();x.general(1,'yijiang2011.yujin');const black=x.f.hand(0,'sha','club'),red=x.f.hand(0,'sha','heart');const ctx=new EvaluationContext(observe(x.f.state,0));
  assert.equal(ctx.shaEffect(1,[black]),0);assert.ok(ctx.shaEffect(1,[red])>0);
});
test('AI无言不向他人用普通锦囊，智迟生效时不再出杀',()=>{
  const x=scene();x.general(0,'yijiang2011.xushu');x.f.hand(0,'guohe');x.f.hand(1,'sha');assert.equal(choose(x.start()).type,'endPlay');
  const y=scene();y.general(1,'yijiang2011.chengong');y.f.hand(0,'sha');damage(y.f.state,1,0);y.advance(y.f.state);assert.equal(choose(y.start()).type,'endPlay');
});
test('AI绝情不把连环友军计入伤害，不被白银减伤误导',()=>{
  const x=scene(5,'junzheng');x.general(0,'yijiang2011.zhangchunhua');x.f.state.players[1].chained=true;x.f.state.players[2].chained=true;x.f.equip(2,'baiyin','armor');
  const ctx=new EvaluationContext(observe(x.f.state,0));assert.equal(ctx.elementalUtility(2,2,'fire'),ctx.elementalUtility(2,2,'normal'));assert.ok(ctx.elementalUtility(2,2,'fire')>ctx.elementalUtility(2,1,'fire'));
});
test('AI恩怨一血时交红桃而非自杀',()=>{
  const x=scene(5);x.general(1,'yijiang2011.fazheng');x.f.state.players[0].hp=1;const id=x.f.hand(0,'tao','heart');damage(x.f.state,1,0);x.advance(x.f.state);const a=choose(x.f.state);assert.ok('ids' in a&&a.ids[0]===id);
});
test('AI补益选择自己的非基本牌，不选择基本牌',()=>{
  const x=scene();x.general(0,'yijiang2011.wuguotai');x.f.hand(0,'sha');const trick=x.f.hand(0,'guohe');damage(x.f.state,0,1,3);x.advance(x.f.state);const a=choose(x.f.state);assert.ok('ids'in a&&a.ids[0]===trick);
});
test('AI补益救友方不救敌方，交换暗牌不会改变评分',()=>{
  const x=scene(5,'standard',true);x.general(1,'yijiang2011.wuguotai');x.f.state.players[0].hp=0;x.f.hand(0,'sha');x.f.hand(0,'guohe');openContentChoice(x.f.state,1,'yijiang2011.buyi',{timing:'reveal',target:0});x.advance(x.f.state);
  assert.notEqual(choose(x.f.state).type,'pass');const before=policy.rank(observe(x.f.state,1),decision(x.f.state)!);x.f.state.players[0].hand.reverse();assert.deepEqual(policy.rank(observe(x.f.state,1),decision(x.f.state)!),before);
  const y=scene();y.general(0,'yijiang2011.wuguotai');y.f.state.players[1].hp=0;y.f.hand(1,'guohe');openContentChoice(y.f.state,0,'yijiang2011.buyi',{timing:'reveal',target:1});y.advance(y.f.state);assert.equal(choose(y.f.state).type,'pass');
});
test('AI破军低血正面敌人发动，背面敌人不翻回',()=>{
  for(const down of [false,true]){const x=scene();x.general(0,'yijiang2011.xusheng');x.f.state.players[1].hp=2;x.f.state.players[1].faceDown=down;damage(x.f.state,1,0,1,null,{name:'sha',suit:null,virtual:true});x.advance(x.f.state);assert.equal(choose(x.f.state).type,down?'no':'yes');}
});
test('AI旋风优先对近邻敌人直接伤害',()=>{
  const x=scene();x.general(0,'yijiang2011.lingtong');x.f.hand(1,'shan');openContentChoice(x.f.state,0,'yijiang2011.xuanfeng',{timing:'effect'});x.advance(x.f.state);const a=choose(x.f.state);assert.ok('choice'in a&&a.choice==='damage:1');
});
test('AI甘露把敌人装备换给己方，不做空交换',()=>{
  const x=scene();x.general(0,'yijiang2011.wuguotai');x.f.state.players[0].hp=2;x.f.equip(1,'bagua','armor');const a=choose(x.start());assert.ok(a.type==='activeSkill'&&a.ability==='yijiang2011.ganlu');
});
test('AI陷阵高点且有后续杀时发动，低点不冒险',()=>{
  for(const rank of [2,13]){const x=scene();x.general(0,'yijiang2011.gaoshun');const point=x.f.hand(0,'shan'),sha=x.f.hand(0,'sha');x.f.state.cards[point].rank=rank;x.f.state.cards[sha].rank=1;x.f.hand(1,'shan');const a=choose(x.start());assert.equal(a.type==='activeSkill'&&a.ability==='yijiang2011.xianzhen',rank===13);}
});
test('AI禁酒把酒用于杀人，不当作没有后续的饮酒',()=>{
  const x=scene(2,'junzheng');x.general(0,'yijiang2011.gaoshun');const wine=x.f.hand(0,'jiu');const a=choose(x.start());assert.ok(a.type==='play'&&a.cid===wine);
});
test('AI酒诗濒死自救，背面受伤后翻回',()=>{
  const x=scene();x.general(1,'yijiang2011.caozhi');damage(x.f.state,1,0,3);x.advance(x.f.state);assert.equal(choose(x.f.state).type,'save');
  const y=scene();y.general(0,'yijiang2011.caozhi');y.f.state.players[0].faceDown=true;openContentChoice(y.f.state,0,'yijiang2011.jiushi',{timing:'flip'});y.advance(y.f.state);const a=choose(y.f.state);assert.ok('choice'in a&&a.choice==='flip');
});
test('AI明策和举荐只向友方赠牌；明策收牌者可自行选择摸牌',()=>{
  const x=scene(5,'standard',true);x.general(1,'yijiang2011.chengong');x.f.hand(1,'sha');const a=choose(x.start(1));assert.ok(a.type==='activeSkill'&&a.ability==='yijiang2011.mingce'&&a.targets[0]===0);
  const y=scene();y.general(0,'yijiang2011.xushu');y.f.hand(0,'sha');y.f.hand(0,'sha');assert.notEqual(choose(y.start()).type,'beginSkill');
});
test('AI心战优先拿红桃，再完成排序，无暗牌依赖',()=>{
  const x=scene();x.general(0,'yijiang2011.masu');const id=x.f.take('tao','heart');x.f.state.table.push(id);openContentChoice(x.f.state,0,'yijiang2011.xinzhan',{timing:'gain',remaining:[id],privateCards:[id],selectedIds:[]});x.advance(x.f.state);const a=choose(x.f.state);assert.ok('choice'in a&&a.choice===`gain:${id}`);
  const s=JSON.parse(JSON.stringify(x.f.state));resolutionStack.require(s,'contentChoice').data.context.remaining=[id];assert.deepEqual(policy.rank(observe(s,0),decision(s)!),policy.rank(observe(x.f.state,0),decision(x.f.state)!));
});

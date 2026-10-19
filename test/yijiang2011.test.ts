import test from 'node:test';
import assert from 'node:assert/strict';
import { yijiangScene as scene, conserved } from './support/yijiang2011-scenario.ts';
import { decision, legalActions } from '../src/core/decision-manager.ts';
import { damage } from '../src/rules/flows/damage-flow.ts';
import { resolutionStack } from '../src/domain/resolution-stack.ts';
import { discardOwned } from '../src/rules/operations/cards.ts';
import { vitals } from '../src/rules/operations/vitals-service.ts';
import { observe } from '../src/core/observation-projector.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { huashenSkills } from '../src/content/mountain/generals/zuoci.ts';
import type { GameState } from '../src/domain/state.ts';
const skill = (x: ReturnType<typeof scene>, s: GameState, id: string, targets?: number[], ids?: number[]) => x.choose(s, a => a.type === 'activeSkill' && a.ability === `yijiang2011.${id}` && (!targets || JSON.stringify(a.targets) === JSON.stringify(targets)) && (!ids || JSON.stringify(a.ids) === JSON.stringify(ids)));
const pick = (x: ReturnType<typeof scene>, s: GameState, choice: string) => x.choose(s, a => 'choice' in a && a.choice === choice);
function effect(x: ReturnType<typeof scene>, run: () => void) { const before = x.f.state.events.length; run(); x.resolution.scheduler.afterStep(x.f.state, before); return x.advance(x.f.state); }

test('一将2011十一将及64种牌包组合，虚拟酒不扩实体牌堆', () => {
  for (const cards of ['standard', 'junzheng'] as const) for (let mask = 0; mask < 32; mask++) {
    const packs = GENERAL_PACKS.filter((_, i) => mask & 1 << i), c = contentForCards(cards, packs);
    assert.equal(c.deck.length, cards === 'standard' ? 108 : 160);
    assert.equal(c.generals().length, 25 + (packs.includes('wind') ? 7 : 0) + ['fire','forest','mountain'].filter(p => packs.includes(p as typeof packs[number])).length * 8 + (packs.includes('yijiang2011') ? 11 : 0));
    if (packs.includes('yijiang2011')) assert.ok(c.card('jiu'));
  }
});
test('毅重仅空防具栏阻挡黑杀，青釭不能无视毅重，红杀生效', () => {
  const x = scene(); x.general(1,'yijiang2011.yujin'); x.f.equip(0,'qinggang','weapon');
  const black = x.f.hand(0,'sha','club'), red=x.f.hand(0,'sha','heart');
  assert.equal(x.runtime.queries.attackEffective(x.f.state,{source:0,target:1,sha:black}),false);
  assert.equal(x.runtime.queries.attackEffective(x.f.state,{source:0,target:1,sha:red}),true);
  x.f.equip(1,'bagua','armor'); assert.equal(x.runtime.queries.attackEffective(x.f.state,{source:0,target:1,sha:black}),true);
});
test('绝情跳过白银、天香和伤害触发，不传导连环也不解除横置', () => {
  const x=scene(5,'junzheng'); x.general(0,'yijiang2011.zhangchunhua'); x.general(1,'wind.xiaoqiao'); x.f.hand(1,'tao','heart'); x.f.equip(1,'baiyin','armor');
  x.f.state.players[1].chained=true; x.f.state.players[2].chained=true;
  damage(x.f.state,1,0,2,null,null,{nature:'fire'});x.advance(x.f.state);
  assert.equal(x.f.state.players[1].hp,1);assert.equal(x.f.state.players[2].hp,4);assert.equal(x.f.state.players[1].chained,true);
  assert.equal(x.f.state.events.some(e=>e.kind==='damaged'),false);assert.equal(x.f.state.events.some(e=>e.kind==='hpLost'),true); conserved(x.f.state);
});
test('伤逝在失去手牌后可补至损失体力，不超过体力上限', () => {
  const x=scene();x.general(0,'yijiang2011.zhangchunhua');x.f.state.players[0].hp=1;const id=x.f.hand(0,'sha');
  let s=effect(x,()=>discardOwned(x.f.state,0,id));s=pick(x,s,'draw');assert.equal(s.players[0].hand.length,2);conserved(s);
});
test('伤逝弃牌阶段内不发动，阶段结束才补牌',()=>{
  const x=scene();x.general(0,'yijiang2011.zhangchunhua');x.f.state.players[0].hp=1;x.f.state.phase='discard';const id=x.f.hand(0,'sha');
  const s=effect(x,()=>discardOwned(x.f.state,0,id));assert.equal(decision(s),null);
  resolutionStack.enqueue(s,{kind:'phaseAfter',phase:'discard'});x.advance(s);assert.equal(decision(s)?.kind,'contentChoice');
});
test('曹植落英只收其他角色弃置的梅花，不收使用牌和自己的弃牌',()=>{
  for(const [owner,reason,expected] of [[1,'discard',true],[1,'use',false],[0,'discard',false]] as const){
    const x=scene();x.general(0,'yijiang2011.caozhi');const id=x.f.hand(owner,'sha','club');let s=effect(x,()=>discardOwned(x.f.state,owner,id,reason));
    assert.equal(!!decision(s),expected);if(expected){s=pick(x,s,`gain:${id}`);assert.ok(s.players[0].hand.includes(id));}conserved(s);
  }
});
test('落英判定牌在天妒之后询问；已获得的牌不能重复获得',()=>{
  const x=scene();x.general(0,'yijiang2011.caozhi');x.general(1,'standard.guojia');const id=x.f.take('sha','club');x.f.state.discard.push(id);
  let s=x.tasks({kind:'openTriggers',signal:{kind:'judgementApplied',data:{player:1,reason:'bagua',card:id}},then:[]});
  assert.ok(s.players[1].hand.includes(id));assert.equal(decision(s),null);conserved(s);
});
test('酒诗零牌饮酒翻面、限制一次；濒死能以酒自救',()=>{
  const x=scene();x.general(0,'yijiang2011.caozhi');let s=x.start();s=x.choose(s,a=>a.type==='virtualBasic'&&a.transformation==='yijiang2011.jiushi');
  assert.equal(s.players[0].faceDown,true);assert.equal(s.players[0].drunk,1);assert.equal(s.jiuUsed,1);assert.ok(!legalActions(s).some(o=>o.data?.type==='virtualBasic'));
  const y=scene();y.general(1,'yijiang2011.caozhi');y.f.state.players[1].hp=1;damage(y.f.state,1,0);y.advance(y.f.state);
  let t=y.choose(y.f.state,a=>a.type==='save'&&a.transformation==='yijiang2011.jiushi');assert.equal(t.players[1].hp,1);assert.equal(t.players[1].faceDown,true);assert.equal(decision(t),null);conserved(t);
});
test('受到伤害前已经翻面的曹植救活后才询问翻回；JSON恢复一致',()=>{
  const x=scene();x.general(1,'yijiang2011.caozhi');x.f.state.players[1].faceDown=true;x.f.state.players[1].hp=1;x.f.hand(1,'tao');damage(x.f.state,1,0);x.advance(x.f.state);
  assert.equal(decision(x.f.state)?.kind,'dying');let s=x.choose(x.f.state,a=>a.type==='save');assert.equal(decision(s)?.kind,'contentChoice');
  const a=pick(x,s,'flip'),b=pick(x,JSON.parse(JSON.stringify(s)),'flip');assert.deepEqual(a,b);assert.equal(a.players[1].faceDown,false);
});
test('恩怨每次伤害只付一张红桃，回复按实际体力逐点奖励',()=>{
  const x=scene(5);x.general(1,'yijiang2011.fazheng');const heart=x.f.hand(0,'tao','heart');damage(x.f.state,1,0,2);x.advance(x.f.state);
  assert.equal(decision(x.f.state)?.actor,0);const s=pick(x,x.f.state,`give:${heart}`);assert.ok(s.players[1].hand.includes(heart));assert.equal(decision(s),null);
  const y=scene();y.general(1,'yijiang2011.fazheng');y.f.state.players[1].hp=1;effect(y,()=>vitals.recover(y.f.state,1,5,0));assert.equal(y.f.state.players[0].hand.length,2);
});
test('恩怨拒绝交牌为体力流失，可进入濒死',()=>{
  const x=scene(5);x.general(1,'yijiang2011.fazheng');x.f.state.players[0].hp=1;x.f.hand(0,'tao');damage(x.f.state,1,0);x.advance(x.f.state);
  const s=pick(x,x.f.state,'lose');assert.equal(s.players[0].hp,0);assert.equal(decision(s)?.kind,'dying');assert.equal(s.events.filter(e=>e.kind==='damaged').length,1);
});
test('眩惑赠红桃、选择暗牌、转交第三人；不泄漏他人手牌',()=>{
  const x=scene(5);x.general(0,'yijiang2011.fazheng');const heart=x.f.hand(0,'tao','heart'), stolen=x.f.hand(1,'sha');let s=skill(x,x.start(),'xuanhuo',[1],[heart]);
  assert.equal(decision(s)?.kind,'contentChoice');assert.ok(!JSON.stringify(decision(s)).includes(`"ids":[${stolen}]`));
  s=pick(x,s,'hand:0');assert.ok(legalActions(s).every(o=>!o.data || !('targets' in o.data) || !o.data.targets?.includes(0)&&!o.data.targets?.includes(1)));
  s=pick(x,s,'give:2');assert.ok(s.players[1].hand.includes(heart));assert.ok(s.players[2].hand.includes(stolen));conserved(s);
});
test('心战私看三张、选择红桃、按顺序还顶且实体牌守恒',()=>{
  const x=scene();x.general(0,'yijiang2011.masu');for(let i=0;i<4;i++)x.f.hand(0,'sha');const a=x.f.top('shan','diamond'),b=x.f.top('sha','club'),h=x.f.top('tao','heart');
  let s=skill(x,x.start(),'xinzhan');assert.equal(observe(s,0).table.length,3);assert.equal(observe(s,1).table.length,0);
  s=pick(x,s,`gain:${h}`);s=pick(x,s,'order');s=pick(x,s,`top:${b}`);s=pick(x,s,`top:${a}`);
  assert.deepEqual(s.deck.slice(-2),[a,b]);assert.ok(s.players[0].hand.includes(h));conserved(s);
});
test('挥泪弃凶手全部手牌装备，保留判定区',()=>{
  const x=scene(5);x.general(1,'yijiang2011.masu');x.f.state.players[1].hp=1;const h=x.f.hand(0,'sha'),e=x.f.equip(0,'bagua','armor'),j=x.f.take('lebu');x.f.state.players[0].judge.push(j);
  damage(x.f.state,1,0);x.advance(x.f.state);assert.equal(x.f.state.players[1].alive,false);assert.ok(x.f.state.discard.includes(h));assert.ok(x.f.state.discard.includes(e));assert.ok(x.f.state.players[0].judge.includes(j));conserved(x.f.state);
});
test('原版无言双向阻止普通锦囊，自己无中和延时锦囊正常',()=>{
  const x=scene();x.general(0,'yijiang2011.xushu');const q=x.runtime.queries,s=x.f.state;
  assert.equal(q.trickEffective(s,1,'guohe',0),false);assert.equal(q.trickEffective(s,0,'wuzhong',0),true);assert.equal(q.trickEffective(s,0,'wanjian',1),false);assert.equal(q.trickEffective(s,0,'lebu',1),true);
  const card=x.f.hand(0,'guohe');const target=x.f.hand(1,'sha');let t=x.start();t=x.choose(t,a=>a.type==='play'&&a.cid===card);assert.ok(t.players[1].hand.includes(target));
});
test('举荐弃三张同类牌回血并令目标摸牌，限一次',()=>{
  const x=scene();x.general(0,'yijiang2011.xushu');x.f.state.players[0].hp=2;const ids=[x.f.hand(0,'sha'),x.f.hand(0,'shan'),x.f.hand(0,'tao')];let s=x.start();
  s=x.choose(s,a=>a.type==='beginSkill'&&a.ability==='yijiang2011.jujian');for(const cid of ids)s=x.choose(s,a=>a.type==='toggle'&&a.cid===cid);s=x.choose(s,a=>a.type==='confirm');
  assert.equal(s.players[0].hp,3);assert.equal(s.players[1].hand.length,3);assert.ok(!legalActions(s).some(o=>o.data?.type==='beginSkill'));conserved(s);
});
test('破军杀伤害后按剩余体力摸牌翻面，非杀不触发',()=>{
  for(const sha of [true,false]){const x=scene();x.general(0,'yijiang2011.xusheng');damage(x.f.state,1,0,1,null,sha?{name:'sha',suit:null,virtual:true}:null);x.advance(x.f.state);
  assert.equal(decision(x.f.state)?.kind,sha?'triggerConfirm':undefined);if(sha){const s=x.choose(x.f.state,a=>a.type==='yes');assert.equal(s.players[1].hand.length,3);assert.equal(s.players[1].faceDown,true);conserved(s);}}
});
test('旧旋风失装备可对距离1造成伤害，或无视距离使用杀',()=>{
  const x=scene(5);x.general(0,'yijiang2011.lingtong');const eq=x.f.equip(0,'bagua','armor');let s=effect(x,()=>discardOwned(x.f.state,0,eq));
  assert.ok(legalActions(s).some(o=>o.data?.type==='choose'&&o.data.choice==='sha:2'));assert.ok(!legalActions(s).some(o=>o.data?.type==='choose'&&o.data.choice==='damage:2'));
  s=pick(x,s,'damage:1');assert.equal(s.players[1].hp,3);conserved(s);
});
test('甘露交换整套装备且失去装备触发旋风',()=>{
  const x=scene(5);x.general(0,'yijiang2011.wuguotai');x.general(1,'yijiang2011.lingtong');x.f.state.players[0].hp=2;const e=x.f.equip(1,'bagua','armor');let s=skill(x,x.start(),'ganlu',[1,2]);
  assert.equal(s.players[1].equip.armor,null);assert.equal(s.players[2].equip.armor,e);assert.equal((decision(s)?.context as {ability:string}).ability,'yijiang2011.xuanfeng');s=pick(x,s,'pass');conserved(s);
});
test('甘露差值超出损失体力时没有候选，允许本人参与',()=>{
  const x=scene();x.general(0,'yijiang2011.wuguotai');x.f.equip(1,'bagua','armor');let s=x.start();assert.ok(!legalActions(s).some(o=>o.data?.type==='activeSkill'&&o.data.ability==='yijiang2011.ganlu'));
  x.f.state.players[0].hp=2;s=skill(x,x.start(),'ganlu',[0,1]);assert.ok(s.players[0].equip.armor);
});
test('补益在求桃之前展示手牌，非基本牌弃置并救回，基本牌不弃',()=>{
  for(const name of ['sha','guohe']){const x=scene(5);x.general(0,'yijiang2011.wuguotai');x.f.state.players[1].hp=1;const id=x.f.hand(1,name);damage(x.f.state,1,2);x.advance(x.f.state);
    assert.equal(decision(x.f.state)?.kind,'contentChoice');assert.ok(!JSON.stringify(decision(x.f.state)).includes(`"ids":[${id}]`));const s=pick(x,x.f.state,'hand:0');assert.equal(s.players[1].alive,name==='guohe');if(name==='guohe')assert.equal(s.players[1].hp,1);conserved(s);
  }
});
test('明策由陈宫指定目标，收牌者自己选择出杀或摸牌',()=>{
  const x=scene(5);x.general(0,'yijiang2011.chengong');const id=x.f.hand(0,'sha');let s=skill(x,x.start(),'mingce',[1],[id]);assert.equal(decision(s)?.actor,0);
  s=pick(x,s,'target:2');assert.equal(decision(s)?.actor,1);s=pick(x,s,'draw');assert.equal(s.players[1].hand.length,2);assert.ok(s.players[1].hand.includes(id));conserved(s);
});
test('智迟回合外伤后免疫杀和普通锦囊，回合变化失效',()=>{
  const x=scene();x.general(1,'yijiang2011.chengong');damage(x.f.state,1,0);x.advance(x.f.state);const s=x.f.state;
  assert.equal(x.runtime.queries.attackEffective(s,{source:0,target:1,sha:{name:'sha',suit:null,virtual:true}}),false);assert.equal(x.runtime.queries.trickEffective(s,1,'guohe',0),false);assert.equal(x.runtime.queries.trickEffective(s,1,'lebu',0),true);
  s.turn++;assert.equal(x.runtime.queries.trickEffective(s,1,'guohe',0),true);
});
test('陷阵胜后仅对拼点目标无视距离防具和次数，其他目标仍受限',()=>{
  const x=scene(5);x.general(0,'yijiang2011.gaoshun');const high=x.f.hand(0,'shan'),low=x.f.hand(2,'sha');x.f.state.cards[high].rank=13;x.f.state.cards[low].rank=1;const sha=x.f.hand(0,'sha');x.f.equip(2,'renwang','armor');let s=skill(x,x.start(),'xianzhen',[2]);
  s=x.choose(s,a=>a.type==='pindian'&&a.cid===high);s=x.choose(s,a=>a.type==='pindian'&&a.cid===low);assert.equal(x.runtime.queries.distance(s,0,2),1);assert.equal(x.runtime.queries.ignoresArmor(s,0,2),true);assert.equal(x.runtime.queries.ignoresArmor(s,0,1),false);
  s.shaUsed=1;resolutionStack.active(s).prompt=null;resolutionStack.enqueue(s,{kind:'phasePlay'});x.advance(s);
  const attacks=legalActions(s).filter(o=>o.data?.type==='play'&&o.data.cid===sha);assert.ok(attacks.length);assert.ok(attacks.every(o=>o.data?.type==='play'&&o.data.targets.every(id=>id===2)));conserved(s);
});
test('陷阵平局也禁杀，禁酒主动和响应均为杀且不能自救',()=>{
  const x=scene(2,'junzheng');x.general(0,'yijiang2011.gaoshun');const a=x.f.hand(0,'shan'),b=x.f.hand(1,'sha');x.f.state.cards[a].rank=7;x.f.state.cards[b].rank=7;const wine=x.f.hand(0,'jiu');
  assert.equal(x.runtime.transforms.candidates(x.f.state,0,'jiu').length,0);assert.ok(x.runtime.transforms.candidates(x.f.state,0,'sha').some(c=>c.ids[0]===wine));
  let s=skill(x,x.start(),'xianzhen',[1]);s=x.choose(s,d=>d.type==='pindian'&&d.cid===a);s=x.choose(s,d=>d.type==='pindian'&&d.cid===b);assert.ok(!legalActions(s).some(o=>o.data?.type==='play'&&o.data.cid===wine));
});
test('禁酒的实体酒实际造成杀伤害，不获得酒加成',()=>{
  const x=scene(2,'junzheng');x.general(0,'yijiang2011.gaoshun');const wine=x.f.hand(0,'jiu');let s=x.choose(x.start(),a=>a.type==='play'&&a.cid===wine);s=x.passResponses(s);
  assert.equal(s.players[1].hp,3);assert.equal(s.players[0].drunk,undefined);assert.equal(s.shaUsed,1);conserved(s);
});
test('化身池排除2011锁定技，允许非锁定主动和触发技能',()=>{
  const x=scene();assert.deepEqual(huashenSkills(x.runtime,'yijiang2011.yujin'),[]);assert.deepEqual(huashenSkills(x.runtime,'yijiang2011.zhangchunhua'),['yijiang2011.shangshi']);
});

test('绝情杀命中时不发动寒冰剑或麒麟弓的伤害时机技能',()=>{
  for(const weapon of ['hanbing','qilin']){const x=scene();x.general(0,'yijiang2011.zhangchunhua');x.f.equip(0,weapon,'weapon');x.f.equip(1,'jueying','plusHorse');x.f.hand(1,'sha');const sha=x.f.hand(0,'sha');let s=x.choose(x.start(),a=>a.type==='play'&&a.cid===sha);s=x.passResponses(s);assert.equal(s.players[1].hp,3);assert.ok(s.players[1].equip.plusHorse);assert.equal(decision(s)?.kind,'play');}
});
test('离间的虚拟决斗也受原版无言限制',()=>{
  const x=scene(5);x.general(0,'standard.diaochan');x.general(1,'yijiang2011.xushu');x.f.state.players[2].sex='male';x.f.hand(0,'sha');const s=x.choose(x.start(),a=>a.type==='activeSkill'&&a.ability==='standard.lijian'&&a.targets[0]===1&&a.targets[1]===2);
  assert.equal(s.players[2].hp,4);assert.equal(decision(s)?.kind,'play');
});
test('陷阵未赢后不能响应借刀使用杀，但仍可向决斗打出杀',()=>{
  const x=scene();x.general(0,'yijiang2011.gaoshun');x.f.state.players[0].skillState={'yijiang2011.xianzhen':{turn:x.f.state.turn,won:false,target:1}};x.f.hand(0,'sha');assert.equal(x.runtime.queries.canSha(x.f.state,0,1),false);assert.equal(x.runtime.transforms.candidates(x.f.state,0,'sha').length,1);
});

test('流离后按新目标重算陷阵的无视防具，不能带给其他角色',()=>{
  for(const target of [1,2]){
    const x=scene(5);x.general(0,'yijiang2011.gaoshun');x.general(1,'standard.daqiao');x.f.equip(0,'zhangba','weapon');x.f.equip(2,'renwang','armor');
    x.f.state.players[0].skillState={'yijiang2011.xianzhen':{turn:x.f.state.turn,won:true,target}};
    const cost=x.f.hand(1,'shan'),sha=x.f.hand(0,'sha','club');let s=x.choose(x.start(),a=>a.type==='play'&&a.cid===sha&&a.targets[0]===1);
    s=x.choose(s,a=>a.type==='redirect'&&a.card===cost&&a.target===2);s=x.passResponses(s);
    assert.equal(s.players[2].hp,target===2?3:4);conserved(s);
  }
});

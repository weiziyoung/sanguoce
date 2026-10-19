import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bindModeSelection, createBrowserSession, gameUrl, generalPacksFromQuery } from '../src/web/game-setup.ts';
import { contentForCards, GENERAL_PACKS } from '../src/app/game-content.ts';
import { yijiang2011GeneralDefinitions } from '../src/content/yijiang2011/content.ts';
import { selectionDetails } from '../src/web/selection-preview.ts';
import { yijiangScene as scene } from './support/yijiang2011-scenario.ts';
import { TableInteraction } from '../src/web/interaction-model.ts';
import { zonePickerChoices } from '../src/web/zone-picker.ts';
import { decision } from '../src/core/decision-manager.ts';
import { observe } from '../src/core/observation-projector.ts';
import { ChineseView } from '../chinese-view.ts';
import { openContentChoice } from '../src/rules/flows/content-choice-flow.ts';
import { responseCard } from '../src/web/response-card.ts';
import { promptResponse } from '../src/content/standard/flows/response-flow.ts';
import { eventSounds } from '../src/web/sound-cues.ts';
import type { AssetManifest } from '../src/web/assets.ts';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'public/assets/manifest.json'),'utf8')) as AssetManifest;
test('一将2011十一将卡面、十九技能说明和语音、阵亡选将素材齐全',()=>{
  for(const g of yijiang2011GeneralDefinitions){
    for(const url of [manifest.generals[g.id],manifest.generalAudio[g.id]?.death,manifest.generalAudio[g.id]?.selection]){assert.ok(url,g.label);assert.ok(existsSync(resolve(root,'public'+url)));}
    for(const id of g.abilities){assert.ok(manifest.generalAudio[g.id]?.skills[id]?.length,id);for(const url of manifest.generalAudio[g.id].skills[id])assert.ok(existsSync(resolve(root,'public'+url)));}
    assert.ok(selectionDetails(g.id,true).skills.every(s=>s.body.length>10));
  }
});
test('一将2011独立勾选、URL和重开保留，与其他包任意组合',()=>{
  const elements:Record<string,{checked:boolean;onclick?:()=>void}>=Object.fromEntries(['cards-standard','cards-junzheng','mode-duel','mode-identity',...GENERAL_PACKS.map(p=>`generals-${p}`)].map(id=>[id,{checked:false}]));
  const sessions:ReturnType<typeof createBrowserSession>[]=[];
  bindModeSelection({getElementById:(id:string)=>elements[id]} as unknown as Document,new URLSearchParams('generals=yijiang2011'),(mode,cards,packs)=>sessions.push(createBrowserSession(mode,7,cards,packs)));
  assert.equal(elements['generals-yijiang2011'].checked,true);
  for(const cards of ['standard','junzheng'] as const)for(let mask=0;mask<32;mask++){
    const packs=GENERAL_PACKS.filter((_,i)=>mask&1<<i);elements['cards-junzheng'].checked=cards==='junzheng';for(const pack of GENERAL_PACKS)elements[`generals-${pack}`].checked=packs.includes(pack);
    for(const mode of ['duel','identity'] as const){elements[`mode-${mode}`].onclick!();const s=sessions.at(-1)!;s.start(s.candidates[0].id);assert.deepEqual(s.record!.config.generalPacks,packs);}
    assert.deepEqual(generalPacksFromQuery(new URL(gameUrl('/sanguoce/',cards,undefined,packs),'https://example.com').searchParams),packs);
  }
  assert.equal(contentForCards('standard',GENERAL_PACKS).generals().length,67);
});
test('模型上下文包含原版技能及当前回合陷阵、智迟状态',()=>{
  const x=scene();x.general(0,'yijiang2011.gaoshun');x.general(1,'yijiang2011.chengong');x.f.state.players[0].skillState={'yijiang2011.xianzhen':{turn:x.f.state.turn,won:true,target:1}};x.f.state.players[1].skillState={'yijiang2011.zhichi':{turn:x.f.state.turn}};
  const s=x.start(),text=new ChineseView().stateForDecision(observe(s,0),decision(s)!);assert.ok(text.includes('陷阵拼点胜'));assert.ok(text.includes('智迟生效'));assert.ok(text.includes('禁酒'));
  s.turn++;assert.deepEqual(observe(s,0).self.skillState,{});
});
test('心战牌仅本人在中央选牌器可见，牌堆顺序没有泄漏给其他角色',()=>{
  const x=scene();x.general(0,'yijiang2011.masu');const id=x.f.take('tao','heart');x.f.state.table.push(id);openContentChoice(x.f.state,0,'yijiang2011.xinzhan',{timing:'gain',remaining:[id],privateCards:[id],selectedIds:[]});x.advance(x.f.state);
  const o=observe(x.f.state,0),m=new TableInteraction(decision(x.f.state)!,o.self.hand);assert.ok(zonePickerChoices(o,m).some(p=>p.card?.id===id));assert.ok(!observe(x.f.state,1).table.length);
});
test('眩惑和补益他人手牌以牌背展示，不提供实体牌ID',()=>{
  for(const ability of ['xuanhuo','buyi']){const x=scene();x.general(0,ability==='xuanhuo'?'yijiang2011.fazheng':'yijiang2011.wuguotai');x.f.hand(1,'sha');x.f.hand(1,'guohe');if(ability==='buyi')x.f.state.players[1].hp=0;
    openContentChoice(x.f.state,0,`yijiang2011.${ability}`,{timing:ability==='xuanhuo'?'take':'reveal',target:1});x.advance(x.f.state);const o=observe(x.f.state,0),m=new TableInteraction(decision(x.f.state)!,o.self.hand),picks=zonePickerChoices(o,m);assert.equal(picks.length,2);assert.ok(picks.every(p=>!p.card&&p.choice.cardIds.length===0));
  }
});
test('禁酒使用事件标明杀，响应画面与语音采用杀而非酒',()=>{
  const x=scene(2,'junzheng');x.general(0,'yijiang2011.gaoshun');const wine=x.f.hand(0,'jiu');let s=x.choose(x.start(),a=>a.type==='play'&&a.cid===wine);const used=s.events.find(e=>e.kind==='cardUsed');assert.ok(used?.kind==='cardUsed'&&used.data.effectiveName==='sha');
  const y=scene(2,'junzheng');y.general(0,'yijiang2011.gaoshun');const w=y.f.hand(0,'jiu');promptResponse(y.f.state,{mode:'nanman',actor:0,source:1});y.advance(y.f.state);s=y.choose(y.f.state,a=>a.type==='respond'&&a.ids[0]===w);const obs=observe(s,1),event=obs.events.find(e=>e.kind==='transformationUsed');assert.ok(event);assert.equal(responseCard(event,obs)?.card.name,'sha');
  const cues=eventSounds(event,obs,manifest);assert.ok(cues.some(c=>c===manifest.cardAudio.sha?.male));assert.ok(!cues.some(c=>c===manifest.cardAudio.jiu?.male));
});

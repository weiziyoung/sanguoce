import type { ContentPack } from '../../rules/content-registry.ts';
import { junzhengPack } from '../junzheng/content.ts';
import { CaoPiGeneral, songweiOffer } from './generals/caopi.ts';
import { XuHuangGeneral } from './generals/xuhuang.ts';
import { SunJianGeneral } from './generals/sunjian.ts';
import { LuSuGeneral } from './generals/lusu.ts';
import { MengHuoGeneral } from './generals/menghuo.ts';
import { ZhuRongGeneral } from './generals/zhurong.ts';
import { DongZhuoGeneral, baonueOffer } from './generals/dongzhuo.ts';
import { JiaXuGeneral } from './generals/jiaxu.ts';
const modules = [new CaoPiGeneral(), new XuHuangGeneral(), new SunJianGeneral(), new LuSuGeneral(),
  new MengHuoGeneral(), new ZhuRongGeneral(), new DongZhuoGeneral(), new JiaXuGeneral()];
export const forestGeneralDefinitions = modules.map(module => module.general);
export const forestPack: ContentPack = { id: 'forest', cards: [], deck: [], generals: forestGeneralDefinitions,
  skills: [...modules.flatMap(module => [...module.skills]), songweiOffer, baonueOffer] };
/** Virtual wine and supply shortage need definitions, while the physical standard deck stays 108. */
export const forestVirtualCardsPack: ContentPack = { id: 'forest.virtual-cards', generals: [], skills: [], deck: [],
  cards: junzhengPack.cards.filter(card => ['jiu', 'bingliang'].includes(card.id)) };

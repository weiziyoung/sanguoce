import type { ContentPack } from '../../rules/content-registry.ts';
import { junzhengPack } from '../junzheng/content.ts';
import { XunYuGeneral } from './generals/xunyu.ts';
import { DianWeiGeneral } from './generals/dianwei.ts';
import { PangTongGeneral } from './generals/pangtong.ts';
import { WoLongGeneral } from './generals/wolong.ts';
import { TaiShiCiGeneral } from './generals/taishici.ts';
import { YuanShaoGeneral } from './generals/yuanshao.ts';
import { YanLiangWenChouGeneral } from './generals/yanliangwenchou.ts';
import { PangDeGeneral } from './generals/pangde.ts';
const modules = [new XunYuGeneral(), new DianWeiGeneral(), new PangTongGeneral(), new WoLongGeneral(),
  new TaiShiCiGeneral(), new YuanShaoGeneral(), new YanLiangWenChouGeneral(), new PangDeGeneral()];
export const fireGeneralDefinitions = modules.map(module => module.general);
export const firePack: ContentPack = { id: 'fire', cards: [], generals: fireGeneralDefinitions,
  skills: modules.flatMap(module => [...module.skills]), deck: [] };
/** Definitions for virtual fire tricks in a standard deck; no extra physical cards. */
export const fireVirtualCardsPack: ContentPack = { id: 'fire.virtual-cards', generals: [], skills: [], deck: [],
  cards: junzhengPack.cards.filter(card => ['huogong', 'tiesuo'].includes(card.id)) };

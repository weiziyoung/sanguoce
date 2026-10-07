import type { ContentPack } from '../../rules/content-registry.ts';
import { CaoRenGeneral } from './generals/caoren.ts';
import { HuangZhongGeneral } from './generals/huangzhong.ts';
import { WeiYanGeneral } from './generals/weiyan.ts';
import { XiaHouYuanGeneral } from './generals/xiahouyuan.ts';
import { XiaoQiaoGeneral } from './generals/xiaoqiao.ts';
import { ZhouTaiGeneral } from './generals/zhoutai.ts';
import { ZhangJiaoGeneral, huangtianGift } from './generals/zhangjiao.ts';
const modules = [new XiaHouYuanGeneral(), new CaoRenGeneral(), new HuangZhongGeneral(), new WeiYanGeneral(),
  new XiaoQiaoGeneral(), new ZhouTaiGeneral(), new ZhangJiaoGeneral()];
export const windGeneralDefinitions = modules.map(module => module.general);
export const windPack: ContentPack = { id: 'wind', cards: [], deck: [], generals: windGeneralDefinitions,
  skills: [...modules.flatMap(module => [...module.skills]), huangtianGift] };

import type { StandardGeneralModule } from './generals/general-module.ts';
import { GuanYuGeneral } from './generals/guanyu.ts';
import { ZhangFeiGeneral } from './generals/zhangfei.ts';
import { ZhaoYunGeneral } from './generals/zhaoyun.ts';
import { HuangYueYingGeneral } from './generals/huangyueying.ts';
import { SunQuanGeneral } from './generals/sunquan.ts';
import { HuaTuoGeneral } from './generals/huatuo.ts';
import { SiMaYiGeneral } from './generals/simayi.ts';
import { LvMengGeneral } from './generals/lvmeng.ts';
import { ZhangLiaoGeneral } from './generals/zhangliao.ts';
import { XuZhuGeneral } from './generals/xuzhu.ts';
import { ZhouYuGeneral } from './generals/zhouyu.ts';
import { HuangGaiGeneral } from './generals/huanggai.ts';
import { MaChaoGeneral } from './generals/machao.ts';
import { XiaHouDunGeneral } from './generals/xiahoudun.ts';
import { ZhenJiGeneral } from './generals/zhenji.ts';
import { GuoJiaGeneral } from './generals/guojia.ts';
import { DiaoChanGeneral } from './generals/diaochan.ts';
import { ZhuGeLiangGeneral } from './generals/zhugeliang.ts';
import { GanNingGeneral } from './generals/ganning.ts';
import { LvBuGeneral } from './generals/lvbu.ts';
import { CaoCaoGeneral } from './generals/caocao.ts';
import { LiuBeiGeneral } from './generals/liubei.ts';
import { DaQiaoGeneral } from './generals/daqiao.ts';
import { LuXunGeneral } from './generals/luxun.ts';
import { SunShangXiangGeneral } from './generals/sunshangxiang.ts';

/** One class per general; one shared implementation per rule mechanism. */
export const standardGeneralModules: readonly StandardGeneralModule[] = [
  new GuanYuGeneral(), new ZhangFeiGeneral(), new ZhaoYunGeneral(),
  new HuangYueYingGeneral(), new SunQuanGeneral(), new HuaTuoGeneral(), new SiMaYiGeneral(),
  new LvMengGeneral(),
  new ZhangLiaoGeneral(), new XuZhuGeneral(),
  new ZhouYuGeneral(),
  new HuangGaiGeneral(),
  new MaChaoGeneral(),
  new XiaHouDunGeneral(),
  new ZhenJiGeneral(),
  new GuoJiaGeneral(),
  new DiaoChanGeneral(),
  new ZhuGeLiangGeneral(),
  new GanNingGeneral(),
  new LvBuGeneral(),
  new CaoCaoGeneral(),
  new LiuBeiGeneral(),
  new DaQiaoGeneral(),
  new LuXunGeneral(),
  new SunShangXiangGeneral(),
];
export const standardGeneralDefinitions = standardGeneralModules.map(module => module.general);
export const standardGeneralSkills = standardGeneralModules.flatMap(module => module.skills);

import { EvaluationRegistry } from '../evaluation-registry.ts';
import { usefulOptionalSkill } from './standard/common.ts';
import { zhihengEvaluation, sunquanEvaluation } from './standard/sunquan.ts';
import { rendeEvaluation } from './standard/liubei.ts';
import { qingnangEvaluation } from './standard/huatuo.ts';
import { kurouEvaluation, huanggaiEvaluation } from './standard/huanggai.ts';
import { luoyiEvaluation } from './standard/xuzhu.ts';
import { tuxiEvaluation } from './standard/zhangliao.ts';
import { jieyinEvaluation } from './standard/sunshangxiang.ts';
import { lijianEvaluation } from './standard/diaochan.ts';
import { fanjianEvaluation } from './standard/zhouyu.ts';
import { guicaiEvaluation } from './standard/simayi.ts';
import { lvmengEvaluation } from './standard/lvmeng.ts';
import { guanxingEvaluation, zhugeliangEvaluation } from './standard/zhugeliang.ts';
import { ganningEvaluation } from './standard/ganning.ts';

/** Composition only: new content registers its own evaluator without changing the policy. */
export function standardSkillEvaluations(): EvaluationRegistry {
  const registry = new EvaluationRegistry();
  for (const [id, evaluator] of Object.entries({
    'standard.zhiheng': zhihengEvaluation, 'standard.rende': rendeEvaluation,
    'standard.qingnang': qingnangEvaluation, 'standard.kurou': kurouEvaluation,
    'standard.luoyi': luoyiEvaluation, 'standard.tuxi': tuxiEvaluation,
    'standard.jieyin': jieyinEvaluation, 'standard.lijian': lijianEvaluation,
    'standard.fanjian': fanjianEvaluation,
    'standard.guicai': guicaiEvaluation,
    'standard.guanxing': guanxingEvaluation, 'standard.luoshen': usefulOptionalSkill,
    'standard.biyue': usefulOptionalSkill, 'standard.yiji': usefulOptionalSkill,
    'standard.tiandu': usefulOptionalSkill, 'standard.jizhi': usefulOptionalSkill,
    'standard.xiaoji': usefulOptionalSkill, 'standard.fankui': usefulOptionalSkill,
    'standard.ganglie': usefulOptionalSkill,
  })) registry.register(id, evaluator);
  registry.registerGeneral('standard.sunquan', sunquanEvaluation)
    .registerGeneral('standard.ganning', ganningEvaluation)
    .registerGeneral('standard.lvmeng', lvmengEvaluation)
    .registerGeneral('standard.zhugeliang', zhugeliangEvaluation)
    .registerGeneral('standard.huanggai', huanggaiEvaluation);
  return registry;
}

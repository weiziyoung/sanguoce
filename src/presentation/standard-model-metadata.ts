import { firePack } from '../content/fire/content.ts';
import { windPack } from '../content/wind/content.ts';
/** Public names for model prompts. Keep in sync with standard general registrations. */
export const STANDARD_MODEL_GENERALS: Readonly<Record<string, {
  label: string; skills: readonly (readonly [id: string, label: string])[];
}>> = {
  ...Object.fromEntries([...windPack.generals, ...firePack.generals].map(general => [general.id, { label: general.label,
    skills: general.abilities.map(id => [id, [...windPack.skills, ...firePack.skills].find(skill => skill.id === id)!.label!] as const) }])),
  'standard.guanyu': { label: '关羽', skills: [['standard.wusheng', '武圣']] },
  'standard.zhangfei': { label: '张飞', skills: [['standard.paoxiao', '咆哮']] },
  'standard.zhaoyun': { label: '赵云', skills: [['standard.longdan', '龙胆']] },
  'standard.huangyueying': { label: '黄月英', skills: [['standard.jizhi', '集智'], ['standard.qicai', '奇才']] },
  'standard.sunquan': { label: '孙权', skills: [['standard.zhiheng', '制衡'], ['standard.jiuyuan', '救援']] },
  'standard.huatuo': { label: '华佗', skills: [['standard.qingnang', '青囊'], ['standard.jijiu', '急救']] },
  'standard.simayi': { label: '司马懿', skills: [['standard.fankui', '反馈'], ['standard.guicai', '鬼才']] },
  'standard.lvmeng': { label: '吕蒙', skills: [['standard.keji', '克己']] },
  'standard.zhangliao': { label: '张辽', skills: [['standard.tuxi', '突袭']] },
  'standard.xuzhu': { label: '许褚', skills: [['standard.luoyi', '裸衣']] },
  'standard.zhouyu': { label: '周瑜', skills: [['standard.yingzi', '英姿'], ['standard.fanjian', '反间']] },
  'standard.huanggai': { label: '黄盖', skills: [['standard.kurou', '苦肉']] },
  'standard.machao': { label: '马超', skills: [['standard.mashu', '马术'], ['standard.tieji', '铁骑']] },
  'standard.xiahoudun': { label: '夏侯惇', skills: [['standard.ganglie', '刚烈']] },
  'standard.zhenji': { label: '甄姬', skills: [['standard.luoshen', '洛神'], ['standard.qingguo', '倾国']] },
  'standard.guojia': { label: '郭嘉', skills: [['standard.tiandu', '天妒'], ['standard.yiji', '遗计']] },
  'standard.diaochan': { label: '貂蝉', skills: [['standard.lijian', '离间'], ['standard.biyue', '闭月']] },
  'standard.zhugeliang': { label: '诸葛亮', skills: [['standard.guanxing', '观星'], ['standard.kongcheng', '空城']] },
  'standard.ganning': { label: '甘宁', skills: [['standard.qixi', '奇袭']] },
  'standard.lvbu': { label: '吕布', skills: [['standard.wushuang', '无双']] },
  'standard.caocao': { label: '曹操', skills: [['standard.jianxiong', '奸雄'], ['standard.hujia', '护驾']] },
  'standard.liubei': { label: '刘备', skills: [['standard.rende', '仁德'], ['standard.jijiang', '激将']] },
  'standard.daqiao': { label: '大乔', skills: [['standard.guose', '国色'], ['standard.liuli', '流离']] },
  'standard.luxun': { label: '陆逊', skills: [['standard.qianxun', '谦逊'], ['standard.lianying', '连营']] },
  'standard.sunshangxiang': { label: '孙尚香', skills: [['standard.xiaoji', '枭姬'], ['standard.jieyin', '结姻']] },
};

export const STANDARD_MODEL_SKILL_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(STANDARD_MODEL_GENERALS).flatMap(general => general.skills));

import type { CardName } from './catalog.ts';

export interface CardAiProfile {
  order?: number;
  value?: number | readonly number[];
  equipValue?: number;
}

/**
 * Sanguoce's heuristic priorities: recover before drawing, then disrupt before
 * attacking. Retention values favor the first defensive card and discount
 * duplicates. These are tuning parameters, not part of the game rules.
 */
export const CARD_AI_PROFILE: Readonly<Partial<Record<CardName, CardAiProfile>>> = {
  sha: { order: 4, value: [6, 3, 1.5] },
  shan: { value: [8, 4, 2] },
  tao: { order: 12, value: 8 },
  wuxie: { value: [7, 4, 2] },
  wugu: { order: 3, value: 3 },
  taoyuan: { order: 10, value: 2 },
  nanman: { order: 6, value: 6 },
  wanjian: { order: 6, value: 6 },
  wuzhong: { order: 9, value: 8 },
  juedou: { order: 5, value: 6 },
  shunshou: { order: 8, value: 6 },
  guohe: { order: 8, value: 5 },
  jiedao: { order: 7, value: 3 },
  lebu: { order: 2, value: 6 },
  shandian: { order: 1, value: 0 },
  bagua: { equipValue: 6 },
  renwang: { equipValue: 6 },
  zhuge: { equipValue: 6 },
  cixiong: { equipValue: 3 },
  qinggang: { equipValue: 3 },
  qinglong: { equipValue: 4 },
  zhangba: { equipValue: 4 },
  guanshi: { equipValue: 5 },
  fangtian: { equipValue: 3 },
  qilin: { equipValue: 4 },
  hanbing: { equipValue: 3 },
};

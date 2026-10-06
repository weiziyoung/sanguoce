/** Military expansion only; attribute Sha remain Sha in the rules model. */
export const JUNZHENG_CARD_SPECS = [
  { id: 'jiu', label: '酒', kind: 'basic', play: { targeting: 'none', availability: 'drink' }, effect: 'custom' },
  { id: 'huogong', label: '火攻', kind: 'trick', play: { targeting: 'single', targetRule: 'hasHand', allowSelf: true, scope: 'selected' }, effect: 'custom' },
  { id: 'tiesuo', label: '铁索连环', kind: 'trick', play: { targeting: 'multiple', maxTargets: 2, allowSelf: true, recast: true, scope: 'selected' }, effect: 'custom' },
  { id: 'bingliang', label: '兵粮寸断', kind: 'delay', play: { targeting: 'single', targetRule: 'distance1UniqueJudge', scope: 'selected' }, effect: 'delay' },
  { id: 'hualiu', label: '骅骝', kind: 'equip', slot: 'plusHorse', abilities: ['standard.plusHorse'], play: { targeting: 'none' }, effect: 'equip' },
  { id: 'guding', label: '古锭刀', kind: 'equip', slot: 'weapon', range: 2, abilities: ['junzheng.guding'], play: { targeting: 'none' }, effect: 'equip' },
  { id: 'zhuque', label: '朱雀羽扇', kind: 'equip', slot: 'weapon', range: 4, abilities: ['junzheng.zhuque'], play: { targeting: 'none' }, effect: 'equip' },
  { id: 'tengjia', label: '藤甲', kind: 'equip', slot: 'armor', abilities: ['junzheng.tengjia'], play: { targeting: 'none' }, effect: 'equip' },
  { id: 'baiyin', label: '白银狮子', kind: 'equip', slot: 'armor', abilities: ['junzheng.baiyin'], play: { targeting: 'none' }, effect: 'equip' },
] as const;

import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class YuJinGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.yujin', label: '于禁', sex: 'male', group: 'wei', hp: 4, abilities: ['yijiang2011.yizhong'] } as const;
  readonly skills = [{ id: 'yijiang2011.yizhong', label: '毅重', modifier: {
    attackEffective: (s, owner, attack) => s.players[owner].equip.armor !== null || cardColor(typeof attack.sha === 'number' ? s.cards[attack.sha] : attack.sha) !== 'black',
  } }] satisfies StandardGeneralModule['skills'];
}

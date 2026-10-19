import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { flip } from '../helpers.ts';
export class XuShengGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.xusheng', label: '徐盛', sex: 'male', group: 'wu', hp: 4, abilities: ['yijiang2011.pojun'] } as const;
  readonly skills = [{ id: 'yijiang2011.pojun', label: '破军', trigger: { id: 'yijiang2011.pojun', event: 'damageTaken', priority: 0, optional: true, grantedBy: 'yijiang2011.pojun',
    owners: (_s, e) => e.data.source === null ? [] : [e.data.source],
    eligible: (s, e) => s.players[e.data.target].alive && (typeof e.data.card === 'number' ? s.cards[e.data.card] : e.data.card)?.name === 'sha',
    execute: (s, e) => { draw(s, e.data.target, Math.max(0, Math.min(5, s.players[e.data.target].hp))); flip(s, e.data.target); },
  } }] satisfies StandardGeneralModule['skills'];
}

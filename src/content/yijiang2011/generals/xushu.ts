import { cardTypeOf, cardType } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { owned } from '../helpers.ts';
export class XuShuGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.xushu', label: '徐庶', sex: 'male', group: 'shu', hp: 3, abilities: ['yijiang2011.wuyan', 'yijiang2011.jujian'] } as const;
  readonly skills = [{ id: 'yijiang2011.wuyan', label: '无言', modifier: { trickEffective: (_s, owner, card, source, target) =>
    cardType(card) !== 'trick' || source === target || (owner !== source && owner !== target),
  } }, { id: 'yijiang2011.jujian', label: '举荐', active: { limit: 'oncePerTurn', cost: 'discardOwned', selection: { min: 1, max: 3, selectable: owned },
    targets: (s, owner) => s.players.filter(p => p.alive && p.id !== owner).map(p => [p.id]),
    execute: (s, owner, ids, targets) => { draw(s, targets[0], ids.length); if (ids.length === 3 && new Set(ids.map(id => cardTypeOf(s.cards[id]) === 'delay' ? 'trick' : cardTypeOf(s.cards[id]))).size === 1) vitals.recover(s, owner); },
  } }] satisfies StandardGeneralModule['skills'];
}

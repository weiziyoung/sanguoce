import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { damage } from '../../../rules/flows/damage-flow.ts';
import { discardOwned, draw } from '../../../rules/operations/cards.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class XiaoQiaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.xiaoqiao', label: '小乔', sex: 'female', group: 'wu', hp: 3,
    abilities: ['wind.tianxiang', 'wind.hongyan'] } as const;
  readonly skills = [{ id: 'wind.hongyan', label: '红颜', modifier: { suit: (_s, _owner, suit) => suit === 'spade' ? 'heart' : suit } },
  { id: 'wind.tianxiang', label: '天香', beforeDamage: (s, owner, runtime) => {
    if (!s.players[owner].hand.some(id => runtime.queries.suit(s, owner, s.cards[id]) === 'heart')) return;
    const context = resolutionStack.require(s, 'damage').data;
    openContentChoice(s, owner, 'wind.tianxiang', { timing: 'damage', source: context.source, amount: context.amount });
  }, choice: {
    options: (s, owner, _context, runtime) => [
      ...s.players[owner].hand.filter(id => runtime.queries.suit(s, owner, s.cards[id]) === 'heart').flatMap(id =>
        s.players.filter(p => p.alive && p.id !== owner).map(p => ({ id: `${id}:${p.id}`, ids: [id], targets: [p.id],
          label: `弃置一张红桃手牌，将伤害转移给${p.label}` }))),
      { id: 'pass', label: '不发动，承受伤害', pass: true },
    ],
    execute: (s, owner, _context, action) => {
      if (action.type === 'pass') return;
      const parent = resolutionStack.nearest(s, 'damage');
      const d = parent.data; const target = action.targets![0];
      discardOwned(s, owner, action.ids![0]); d.cancelled = true;
      // The source, card, nature and already-applied source bonuses survive transfer.
      damage(s, target, d.source, d.amount,
        { kind: 'contentCallback', ability: 'wind.tianxiang', owner, context: { timing: 'draw', target } }, d.card,
        { nature: d.nature, redirectedBy: owner, forcedBy: d.forcedBy, sourceModified: true,
          ...(d.propagated ? { propagated: true } : {}) });
    },
  }, callback: (s, _owner, context) => {
    const p = s.players[context.target!];
    if (p.alive) draw(s, p.id, Math.max(0, p.maxHp - p.hp));
  } }] satisfies StandardGeneralModule['skills'];
}

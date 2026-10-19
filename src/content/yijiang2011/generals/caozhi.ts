import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { flip, pass, gain } from '../helpers.ts';
export class CaoZhiGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.caozhi', label: '曹植', sex: 'male', group: 'wei', hp: 3, abilities: ['yijiang2011.luoying', 'yijiang2011.jiushi'] } as const;
  readonly skills = [{ id: 'yijiang2011.luoying', label: '落英', events: ['discarded'], onEvent: (s, owner, e) => {
    if (e.kind === 'discarded' && e.data.player !== owner && e.data.reason === 'discard' && s.cards[e.data.card].suit === 'club' && s.discard.includes(e.data.card))
      openContentChoice(s, owner, 'yijiang2011.luoying', { timing: 'gain', selectedIds: [e.data.card] });
  }, trigger: { id: 'yijiang2011.luoying', event: 'judgementApplied', priority: -5, grantedBy: 'yijiang2011.luoying', optional: true,
    owners: s => s.players.filter(p => p.alive).map(p => p.id),
    eligible: (s, e, owner) => e.data.player !== owner && s.cards[e.data.card].suit === 'club' && s.discard.includes(e.data.card),
    execute: (s, e, owner) => { cardMovement.move(s, [e.data.card], { kind: 'hand', owner }); gain(s, owner, [e.data.card], 'yijiang2011.luoying'); },
  }, choice: { options: (s, _owner, ctx) => [...(ctx.selectedIds ?? []).filter(id => s.discard.includes(id)).map(id => ({ id: `gain:${id}`, ids: [id], label: '获得这张梅花牌' })), pass],
    execute: (s, owner, _ctx, a) => { if (a.type === 'pass') return; cardMovement.move(s, a.ids, { kind: 'hand', owner }); gain(s, owner, a.ids, 'yijiang2011.luoying'); },
  } }, { id: 'yijiang2011.jiushi', label: '酒诗', transformation: { id: 'yijiang2011.jiushi', grantedBy: 'yijiang2011.jiushi', produces: 'jiu',
    costs: (s, owner) => s.players[owner].faceDown ? [] : [[]], onUse: flip,
  }, trigger: { id: 'yijiang2011.jiushi', event: 'damageTaken', priority: 0, grantedBy: 'yijiang2011.jiushi',
    owners: (_s, e) => [e.data.target], eligible: (s, _e, owner) => !!s.players[owner].faceDown && !![...s.resolution.stack].reverse().find(f => f.kind === 'damage')?.data.targetWasFaceDown,
    execute: (s, _e, owner) => openContentChoice(s, owner, 'yijiang2011.jiushi', { timing: 'flip' }),
  }, choice: { options: (s, owner) => s.players[owner].faceDown ? [{ id: 'flip', label: '将武将牌翻回正面' }, pass] : [],
    execute: (s, owner, _ctx, a) => { if (a.type !== 'pass') flip(s, owner); },
  } }] satisfies StandardGeneralModule['skills'];
}

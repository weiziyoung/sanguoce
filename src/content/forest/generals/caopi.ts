import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import type { SkillDefinition } from '../../../rules/content-registry.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { give, owned } from '../helpers.ts';
export class CaoPiGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.caopi', label: '曹丕', sex: 'male', group: 'wei', hp: 3,
    abilities: ['forest.xingshang', 'forest.fangzhu', 'forest.songwei'] } as const;
  readonly skills = [{ id: 'forest.xingshang', label: '行殇', onDeath: (s, owner, target) => {
    if (owned(s, target).length) openContentChoice(s, owner, 'forest.xingshang', { timing: 'inherit', target });
  }, choice: {
    options: (s, _owner, context) => owned(s, context.target!).length ? [
      { id: 'inherit', label: '获得死者所有手牌和装备牌' }, { id: 'pass', label: '不发动', pass: true },
    ] : [],
    execute: (s, owner, context, action) => { if (action.type !== 'pass') give(s, context.target!, owner, owned(s, context.target!), 'forest.xingshang'); },
  } }, { id: 'forest.fangzhu', label: '放逐', trigger: {
    id: 'forest.fangzhu', label: '放逐', grantedBy: 'forest.fangzhu', event: 'damageTaken', priority: 5, optional: true,
    owners: (_s, event) => [event.data.target], eligible: (s, event, owner) => event.data.target === owner && s.players[owner].alive,
    execute: (s, _event, owner) => openContentChoice(s, owner, 'forest.fangzhu', { timing: 'target' }),
  }, choice: {
    options: (s, owner) => s.players.filter(p => p.alive && p.id !== owner).map(p => ({ id: `target:${p.id}`, targets: [p.id], label: `令${p.label}摸牌并翻面` })),
    execute: (s, owner, _context, action) => {
      const target = s.players[action.targets[0]];
      draw(s, target.id, Math.max(0, s.players[owner].maxHp - s.players[owner].hp));
      target.faceDown = !target.faceDown;
      emitEvent(s, 'turnedOver', { player: target.id, faceDown: target.faceDown });
    },
  } }, { id: 'forest.songwei', label: '颂威', lordSkill: true }] satisfies StandardGeneralModule['skills'];
}
export const songweiOffer: SkillDefinition = { id: 'forest.songwei.offer', label: '颂威',
  grantedTo: (s, owner) => s.mode.id === 'identity' && s.players[owner].group === 'wei' && s.players.some(p =>
    p.alive && p.id !== owner && !p.generalSkillsDisabled && p.general === 'forest.caopi' && s.mode.roles[p.id] === 'lord'),
  trigger: { id: 'forest.songwei.offer', label: '颂威', grantedBy: 'forest.songwei.offer', event: 'judgementApplied', priority: 5, optional: true,
    owners: (_s, event) => [event.data.player], eligible: (s, event, owner) => event.data.player === owner && cardColor(s.cards[event.data.card]) === 'black',
    execute: (s, _event, owner) => { const lord = s.players.find(p => p.alive && !p.generalSkillsDisabled && p.general === 'forest.caopi' && s.mode.roles[p.id] === 'lord'); if (lord) draw(s, lord.id, 1); },
  } };

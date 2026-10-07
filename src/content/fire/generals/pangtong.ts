import { emitEvent } from '../../../domain/event-journal.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { discardOwned, draw } from '../../../rules/operations/cards.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
export class PangTongGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.pangtong', label: '庞统', sex: 'male', group: 'shu', hp: 3, abilities: ['fire.lianhuan', 'fire.niepan'] } as const;
  readonly skills = [{ id: 'fire.lianhuan', label: '连环', transformation: { id: 'fire.lianhuan', grantedBy: 'fire.lianhuan', produces: 'tiesuo',
    costs: (s, owner) => s.players[owner].hand.filter(id => s.cards[id].suit === 'club').map(id => [id]) } },
  { id: 'fire.niepan', label: '涅槃', hpChanged: (s, owner, before, after) => {
    if (after < before && after <= 0 && !s.players[owner].skillFlags?.['fire.niepan.used']) openContentChoice(s, owner, 'fire.niepan', { timing: 'dying' });
  }, choice: {
    options: (s, owner) => s.players[owner].skillFlags?.['fire.niepan.used'] ? [] : [
      { id: 'recover', label: '发动涅槃：弃置所有牌，重置武将，摸三张牌并回复至3点体力' }, { id: 'pass', label: '不发动，继续救援', pass: true }],
    execute: (s, owner, _context, action) => {
      if (action.type === 'pass') return;
      const p = s.players[owner]; p.skillFlags ??= {}; p.skillFlags['fire.niepan.used'] = true;
      for (const id of [...p.hand, ...p.judge, ...Object.values(p.equip).filter((id): id is number => id !== null)]) discardOwned(s, owner, id);
      if (p.faceDown) { p.faceDown = false; emitEvent(s, 'turnedOver', { player: owner, faceDown: false }); }
      if (p.chained) { p.chained = false; emitEvent(s, 'chainChanged', { player: owner, chained: false }); }
      // Equipment loss effects finish before the draw and recovery portion of Niepan.
      resolutionStack.enqueue(s, { kind: 'contentCallback', ability: 'fire.niepan', owner, context: { timing: 'recover' } });
    },
  }, callback: (s, owner) => {
    const p = s.players[owner];
    draw(s, owner, 3); vitals.recover(s, owner, Math.max(0, Math.min(3, p.maxHp) - p.hp));
  } }] satisfies StandardGeneralModule['skills'];
}

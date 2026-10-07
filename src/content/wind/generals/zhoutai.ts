import { emitEvent } from '../../../domain/event-journal.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { deckService } from '../../../rules/operations/deck-service.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class ZhouTaiGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.zhoutai', label: '周泰', sex: 'male', group: 'wu', hp: 4, abilities: ['wind.buqu'] } as const;
  readonly skills = [{ id: 'wind.buqu', label: '不屈', hpChanged: (s, owner, before, after) => {
    const p = s.players[owner]; const pile = p.piles?.['wind.buqu'] ?? [];
    if (after < before && p.hp <= 0) {
      p.skillFlags ??= {}; p.skillFlags['wind.buqu.declined'] = false;
      openContentChoice(s, owner, 'wind.buqu', { timing: 'add' });
    } else if (after > before && pile.length > Math.max(0, 1 - p.hp)) {
      openContentChoice(s, owner, 'wind.buqu', { timing: 'remove' });
    }
  }, modifier: {
    survivesDying: (s, owner) => {
      const p = s.players[owner]; const pile = p.piles?.['wind.buqu'] ?? [];
      return !p.skillFlags?.['wind.buqu.declined'] && pile.length >= 1 - p.hp &&
        new Set(pile.map(id => s.cards[id].rank)).size === pile.length;
    },
  }, choice: {
    options: (s, owner, context) => context.timing === 'add' ? [
      { id: 'add', label: '发动不屈，亮出不屈牌' }, { id: 'pass', label: '不发动，进入濒死', pass: true },
    ] : (s.players[owner].piles?.['wind.buqu'] ?? []).map(id => ({ id: `remove:${id}`, ids: [id], label: `移去不屈牌（点数 ${s.cards[id].rank}）` })),
    execute: (s, owner, context, action) => {
      const p = s.players[owner]; p.piles ??= {}; const pile = p.piles['wind.buqu'] ??= [];
      if (action.type === 'pass') { p.skillFlags ??= {}; p.skillFlags['wind.buqu.declined'] = true; return; }
      if (context.timing === 'add') {
        deckService.takeTop(s, Math.max(0, 1 - p.hp - pile.length), { kind: 'pile', owner, ability: 'wind.buqu' });
      } else {
        cardMovement.move(s, action.ids!, { kind: 'discard' }, owner);
        if (pile.length > Math.max(0, 1 - p.hp)) openContentChoice(s, owner, 'wind.buqu', { timing: 'remove' });
      }
      emitEvent(s, 'pileChanged', { player: owner, ability: 'wind.buqu', cards: [...pile] });
    },
  } }] satisfies StandardGeneralModule['skills'];
}

import { cardColor, NAMES } from '../../../catalog.ts';
import { emitEvent } from '../../domain/event-journal.ts';
import type { AnyTriggerDefinition } from '../../rules/trigger-registry.ts';
import { cancelTriggerWindow } from '../../rules/trigger-resolver.ts';
import { promptCixiong, promptGuanshi, promptHanbing, promptQilin, promptQinglong } from './equipment-flow.ts';

export const standardTriggerDefinitions: readonly AnyTriggerDefinition[] = [
  { id: 'standard.cixiong', label: NAMES.cixiong, grantedBy: 'standard.cixiong', event: 'attackTargeted', priority: 20,
    owners: (_s, e) => [e.data.source],
    eligible: (s, e, owner) => s.players[e.data.target].alive && s.players[owner].sex !== s.players[e.data.target].sex,
    execute: (s, e) => promptCixiong(s, e.data),
  },
  { id: 'standard.renwang', label: NAMES.renwang, grantedBy: 'standard.renwang', event: 'attackTargeted', priority: 10,
    owners: (_s, e) => [e.data.target],
    eligible: (s, e, _owner, abilities) =>
      !abilities?.has(s, e.data.source, 'standard.qinggang') &&
      cardColor(typeof e.data.sha === 'number' ? s.cards[e.data.sha] : e.data.sha) === 'black',
    execute: s => { cancelTriggerWindow(s); emitEvent(s, 'abilityActivated', { ability: 'renwang', owner: null, effect: 'blockBlackSha' }); },
  },
  { id: 'standard.qinglong', label: NAMES.qinglong, grantedBy: 'standard.qinglong', event: 'attackMissed', priority: 10,
    owners: (_s, e) => [e.data.source],
    eligible: (s, e, owner, _abilities, runtime) => s.players[e.data.target].alive &&
      (runtime ? runtime.transforms.candidates(s, owner, 'sha').length > 0 :
        s.players[owner].hand.some(id => s.cards[id].name === 'sha')),
    execute: (s, e, _owner, runtime) => promptQinglong(s, e.data, runtime),
  },
  { id: 'standard.guanshi', label: NAMES.guanshi, grantedBy: 'standard.guanshi', event: 'attackMissed', priority: 10,
    owners: (_s, e) => [e.data.source],
    eligible: (s, e) => s.players[e.data.target].alive,
    execute: (s, e) => promptGuanshi(s, e.data),
  },
  { id: 'standard.hanbing', label: NAMES.hanbing, grantedBy: 'standard.hanbing', event: 'beforeAttackDamage', priority: 20,
    owners: (_s, e) => [e.data.source],
    eligible: (s, e) => s.players[e.data.target].alive &&
      (s.players[e.data.target].hand.length > 0 || Object.values(s.players[e.data.target].equip).some(id => id !== null)),
    execute: (s, e) => promptHanbing(s, e.data),
  },
  { id: 'standard.qilin', label: NAMES.qilin, grantedBy: 'standard.qilin', event: 'beforeAttackDamage', priority: 10,
    owners: (_s, e) => [e.data.source],
    eligible: (s, e) => s.players[e.data.target].alive &&
      (s.players[e.data.target].equip.plusHorse !== null || s.players[e.data.target].equip.minusHorse !== null),
    execute: (s, e) => promptQilin(s, e.data),
  },
];

import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import type { SkillDefinition } from '../../../rules/content-registry.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import { beginDying } from '../../../rules/flows/dying-flow.ts';
import { loseLife } from '../helpers.ts';
export class DongZhuoGeneral implements StandardGeneralModule {
  readonly general = { id: 'forest.dongzhuo', label: '董卓', sex: 'male', group: 'qun', hp: 8,
    abilities: ['forest.jiuchi', 'forest.roulin', 'forest.benghuai', 'forest.baonue'] } as const;
  readonly skills = [{ id: 'forest.jiuchi', label: '酒池', transformation: {
    id: 'forest.jiuchi', grantedBy: 'forest.jiuchi', produces: 'jiu', costs: (s, owner) => s.players[owner].hand.filter(id => s.cards[id].suit === 'spade').map(id => [id]),
  } }, { id: 'forest.roulin', label: '肉林', modifier: {
    responseCount: (s, _owner, _source, target, mode, n) => mode === 'sha' && s.players[target].sex === 'female' ? Math.max(2, n) : n,
    incomingResponseCount: (s, _owner, source, mode, n) => mode === 'sha' && s.players[source].sex === 'female' ? Math.max(2, n) : n,
  } }, { id: 'forest.benghuai', label: '崩坏', endPhase: { optional: false,
    available: (s, owner) => s.players.some(p => p.alive && p.id !== owner && p.hp < s.players[owner].hp),
    execute: (s, owner) => openContentChoice(s, owner, 'forest.benghuai', { timing: 'loss' }),
  }, choice: { silent: true,
    options: () => [{ id: 'hp', label: '失去1点体力' }, { id: 'maxHp', label: '减1点体力上限' }],
    execute: (s, owner, _context, action) => {
      if (action.choice === 'hp') loseLife(s, owner);
      else { vitals.loseMaxHp(s, owner, 1); if (s.players[owner].hp <= 0) beginDying(s, owner); }
    },
  } }, { id: 'forest.baonue', label: '暴虐', lordSkill: true }] satisfies StandardGeneralModule['skills'];
}
export const baonueOffer: SkillDefinition = { id: 'forest.baonue.offer', label: '暴虐',
  grantedTo: (s, owner) => s.mode.id === 'identity' && s.players[owner].group === 'qun' && s.players.some(p => p.alive && p.id !== owner &&
    !p.generalSkillsDisabled && p.general === 'forest.dongzhuo' && s.mode.roles[p.id] === 'lord'),
  trigger: { id: 'forest.baonue.offer', label: '暴虐', grantedBy: 'forest.baonue.offer', event: 'damageTaken', priority: 5, optional: true,
    owners: (_s, event) => event.data.source === null ? [] : [event.data.source],
    eligible: (_s, event, owner) => event.data.source === owner,
    execute: (s, _event, owner, runtime) => new JudgementFlow(runtime!).begin(s, owner, 'forest.baonue.offer',
      { kind: 'contentCallback', ability: 'forest.baonue.offer', owner, context: { timing: 'judge' } }, '暴虐'),
  }, callback: (s, owner, _context, runtime) => {
    const final = resolutionStack.require(s, 'judgement').data.finalId;
    const lord = s.players.find(p => p.alive && !p.generalSkillsDisabled && p.general === 'forest.dongzhuo' && s.mode.roles[p.id] === 'lord');
    if (lord && final !== null && runtime.queries.suit(s, owner, s.cards[final]) === 'spade') vitals.recover(s, lord.id);
  } };

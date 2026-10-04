import { discardOwned } from '../../../rules/operations/cards.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { damage } from '../flows/damage-flow.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class XiaHouDunGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.xiahoudun', label: '夏侯惇', sex: 'male', group: 'wei', hp: 4,
    abilities: ['standard.ganglie'] } as const;
  readonly skills = [{ id: 'standard.ganglie', label: '刚烈', trigger: {
    id: 'standard.ganglie', label: '刚烈', grantedBy: 'standard.ganglie', event: 'damageTaken',
    priority: 5, optional: true,
    owners: (_state, event) => [event.data.target],
    eligible: (state, event, owner) => event.data.target === owner && event.data.source !== null &&
      event.data.source !== owner && state.players[event.data.source]?.alive === true,
    execute: (state, event, owner, runtime) => {
      if (!runtime) throw new Error('刚烈缺少内容运行时');
      new JudgementFlow(runtime).begin(state, owner, 'standard.ganglie', {
        kind: 'applySkillJudgement', ability: 'standard.ganglie', owner, source: event.data.source,
      }, '刚烈');
    },
  }, skillJudgement: {
    actor: (_state, _owner, source) => source,
    options: (state, _owner, source, finalId) => {
      if (source === null || !state.players[source].alive || finalId === null ||
        state.cards[finalId].suit === 'heart') return [];
      const hand = state.players[source].hand;
      const options = hand.flatMap((id, index) => hand.slice(index + 1).map(second => ({
        id: `discard:${id}:${second}`, label: '弃两张手牌', cardIds: [id, second],
      })));
      return [...options, { id: 'damage', label: '受到1点伤害' }];
    },
    execute: (state, owner, source, _finalId, choice) => {
      if (source === null) return;
      if (choice === 'damage') { damage(state, source, owner); return; }
      const [, first, second] = choice.split(':').map(Number);
      if (!state.players[source].hand.includes(first) || !state.players[source].hand.includes(second) || first === second) {
        throw new Error('刚烈弃牌已失效');
      }
      discardOwned(state, source, first);
      discardOwned(state, source, second);
    },
  } }] satisfies StandardGeneralModule['skills'];
}

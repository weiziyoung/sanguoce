import { emitEvent } from '../../../domain/event-journal.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import type { StandardGeneralModule } from './general-module.ts';

export class CaoCaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'standard.caocao', label: '曹操', sex: 'male', group: 'wei', hp: 4,
    abilities: ['standard.jianxiong', 'standard.hujia'] } as const;
  readonly skills = [
    { id: 'standard.jianxiong', label: '奸雄', trigger: {
      id: 'standard.jianxiong', label: '奸雄', grantedBy: 'standard.jianxiong',
      event: 'damageTaken', priority: 5, optional: true,
      owners: (_state, event) => [event.data.target],
      eligible: (state, event, owner) => event.data.target === owner &&
        typeof event.data.card === 'number' && state.table.includes(event.data.card),
      execute: (state, event, owner) => {
        const card = event.data.card;
        if (typeof card !== 'number') return;
        cardMovement.move(state, [card], { kind: 'hand', owner });
        emitEvent(state, 'gained', { from: owner, to: owner, card, hidden: false });
      },
    } },
    { id: 'standard.hujia', label: '护驾', lordSkill: true,
      proxyResponse: { produces: 'shan', group: 'wei' } },
  ] satisfies StandardGeneralModule['skills'];
}

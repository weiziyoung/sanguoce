import { emitEvent } from '../../../domain/event-journal.ts';
import { vitals } from '../../../rules/operations/vitals-service.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class WeiYanGeneral implements StandardGeneralModule {
  readonly general = { id: 'wind.weiyan', label: '魏延', sex: 'male', group: 'shu', hp: 4, abilities: ['wind.kuanggu'] } as const;
  readonly skills = [{ id: 'wind.kuanggu', label: '狂骨', afterDamage: (s, owner, context, amount, runtime) => {
    if (runtime.queries.distance(s, owner, context.target) > 1 || s.players[owner].hp >= s.players[owner].maxHp) return;
    emitEvent(s, 'skillActivated', { ability: 'wind.kuanggu', label: '狂骨', owner, targets: [owner] });
    vitals.recover(s, owner, amount);
  } }] satisfies StandardGeneralModule['skills'];
}

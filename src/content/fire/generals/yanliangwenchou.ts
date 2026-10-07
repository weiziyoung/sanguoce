import { cardColor } from '../../../../catalog.ts';
import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import { JudgementFlow } from '../../../rules/flows/judgement-flow.ts';
import { cardMovement } from '../../../rules/operations/card-movement-service.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
export class YanLiangWenChouGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.yanliangwenchou', label: '颜良文丑', sex: 'male', group: 'qun', hp: 4, abilities: ['fire.shuangxiong'] } as const;
  readonly skills = [{ id: 'fire.shuangxiong', label: '双雄', drawPhase: {
    options: () => [{ id: 'judge', label: '以判定替代摸牌，获得判定牌并解锁异色决斗', targets: [] }],
    execute: (s, owner, _targets, runtime) => new JudgementFlow(runtime).begin(s, owner, 'fire.shuangxiong',
      { kind: 'contentCallback', ability: 'fire.shuangxiong', owner, context: { timing: 'judge' } }, '双雄'),
  }, callback: (s, owner) => {
    const id = resolutionStack.require(s, 'judgement').data.finalId;
    if (id === null) return;
    s.skillUses ??= []; const count = cardColor(s.cards[id]) === 'red' ? 1 : 2;
    const record = s.skillUses.find(u => u.owner === owner && u.ability === 'fire.shuangxiong.color');
    if (record) { record.turn = s.turn; record.count = count; }
    else s.skillUses.push({ owner, ability: 'fire.shuangxiong.color', turn: s.turn, count });
    if (s.discard.includes(id)) { cardMovement.move(s, [id], { kind: 'hand', owner }); emitEvent(s, 'gained', { from: owner, to: owner, card: id, hidden: false }); }
  }, transformation: { id: 'fire.shuangxiong', grantedBy: 'fire.shuangxiong', produces: 'juedou', costs: (s, owner) => {
    const color = s.skillUses?.find(u => u.owner === owner && u.ability === 'fire.shuangxiong.color' && u.turn === s.turn)?.count;
    return s.active === owner && s.phase === 'play' && color ? s.players[owner].hand.filter(id => (cardColor(s.cards[id]) === 'red' ? 1 : 2) !== color).map(id => [id]) : [];
  } } }] satisfies StandardGeneralModule['skills'];
}

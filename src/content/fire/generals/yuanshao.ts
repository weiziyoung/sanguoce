import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
export class YuanShaoGeneral implements StandardGeneralModule {
  readonly general = { id: 'fire.yuanshao', label: '袁绍', sex: 'male', group: 'qun', hp: 4, abilities: ['fire.luanji', 'fire.xueyi'] } as const;
  readonly skills = [{ id: 'fire.luanji', label: '乱击', transformation: { id: 'fire.luanji', grantedBy: 'fire.luanji', produces: 'wanjian',
    costs: (s, owner) => s.players[owner].hand.flatMap((id, i, hand) => hand.slice(i + 1).filter(other => s.cards[other].suit === s.cards[id].suit).map(other => [id, other])) } },
  { id: 'fire.xueyi', label: '血裔', lordSkill: true, modifier: { handLimit: (s, owner, n) => s.mode.id === 'identity' && s.mode.roles[owner] === 'lord' ? n +
    s.players.filter(p => p.alive && p.id !== owner && p.group === 'qun').length * 2 : n } }] satisfies StandardGeneralModule['skills'];
}

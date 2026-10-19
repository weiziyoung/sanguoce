import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import type { GameState } from '../../../domain/state.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { draw } from '../../../rules/operations/cards.ts';
import { pass } from '../helpers.ts';
function offer(s: GameState, owner: number) {
  const p = s.players[owner];
  if (p.alive && p.hand.length < p.maxHp - Math.max(0, p.hp) && !(s.active === owner && s.phase === 'discard'))
    openContentChoice(s, owner, 'yijiang2011.shangshi', { timing: 'draw' });
}
export class ZhangChunHuaGeneral implements StandardGeneralModule {
  readonly general = { id: 'yijiang2011.zhangchunhua', label: '张春华', sex: 'female', group: 'wei', hp: 3, abilities: ['yijiang2011.jueqing', 'yijiang2011.shangshi'] } as const;
  readonly skills = [{ id: 'yijiang2011.jueqing', label: '绝情', modifier: { damageAsHpLoss: () => true } },
  { id: 'yijiang2011.shangshi', label: '伤逝', hpChanged: (s, owner) => offer(s, owner),
    phaseAfter: (s, owner) => { const p = s.players[owner]; if (s.active === owner && p.hand.length < p.maxHp - Math.max(0, p.hp)) openContentChoice(s, owner, 'yijiang2011.shangshi', { timing: 'draw' }); },
    trigger: { id: 'yijiang2011.shangshi', event: 'cardsLost', priority: 0, grantedBy: 'yijiang2011.shangshi',
      owners: (_s, e) => [e.data.player], eligible: (s, e, owner) => e.data.hand.length > 0 && !(s.active === owner && s.phase === 'discard') && s.players[owner].hand.length < s.players[owner].maxHp - Math.max(0, s.players[owner].hp),
      execute: (s, _e, owner) => offer(s, owner),
    }, choice: { options: (s, owner) => s.players[owner].hand.length < s.players[owner].maxHp - Math.max(0, s.players[owner].hp) ? [{ id: 'draw', label: '摸牌至已损失体力值' }, pass] : [],
      execute: (s, owner, _ctx, a) => { if (a.type !== 'pass') draw(s, owner, Math.max(0, s.players[owner].maxHp - Math.max(0, s.players[owner].hp) - s.players[owner].hand.length)); },
    } }] satisfies StandardGeneralModule['skills'];
}

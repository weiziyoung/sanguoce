import type { StandardGeneralModule } from '../../standard/generals/general-module.ts';
import type { ReadonlyGameState, GameState } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { openContentChoice } from '../../../rules/flows/content-choice-flow.ts';
import { resolutionStack } from '../../../domain/resolution-stack.ts';
import { random } from '../../../rules/operations/random.ts';
import { emitEvent } from '../../../domain/event-journal.ts';
/** Original Huashen excludes locked, limited, awakening and lord skills. */
const excluded = new Set(['standard.paoxiao', 'standard.qicai', 'standard.mashu', 'standard.wushuang', 'standard.kongcheng', 'standard.qianxun',
  'wind.kuanggu', 'wind.hongyan', 'fire.mashu', 'fire.bazhen', 'fire.niepan', 'forest.huoshou', 'forest.juxiang', 'forest.roulin', 'forest.benghuai', 'forest.wansha', 'forest.weimu', 'forest.luanwu',
  'mountain.zaoxian', 'mountain.zhiji', 'mountain.xiangle', 'mountain.hunzi', 'mountain.ruoyu', 'mountain.duanchang', 'mountain.huashen', 'mountain.xinsheng']);
export function huashenSkills(runtime: Pick<ContentRuntime, 'content'>, general: string): string[] {
  return runtime.content.general(general).abilities.filter(id => !excluded.has(id) && !runtime.content.requireSkill(id).lordSkill);
}
function addAvatars(s: GameState, owner: number, count: number, runtime: ContentRuntime) {
  const p = s.players[owner]; p.huashen ??= { generals: [] };
  const used = new Set(s.players.flatMap(p => [p.general, ...(p.huashen?.generals ?? [])]));
  const pool = runtime.content.generals().filter(g => !used.has(g.id) && huashenSkills(runtime, g.id).length).map(g => g.id);
  for (let i = 0; i < count && pool.length; i++) { const index = Math.floor(random(s) * pool.length); p.huashen.generals.push(pool.splice(index, 1)[0]); }
}
const canChange = (s: ReadonlyGameState, owner: number) => !!s.players[owner].huashen?.generals.length;
export class ZuoCiGeneral implements StandardGeneralModule {
  readonly general = { id: 'mountain.zuoci', label: '左慈', sex: 'male', group: 'qun', hp: 3, abilities: ['mountain.huashen', 'mountain.xinsheng'] } as const;
  readonly skills = [{ id: 'mountain.huashen', label: '化身', gameStart: (s, owner, runtime) => {
    addAvatars(s, owner, 2, runtime); openContentChoice(s, owner, 'mountain.huashen', { timing: 'initial' });
  }, startPhase: { available: canChange, activate: (s, owner) => openContentChoice(s, owner, 'mountain.huashen', { timing: 'start' }) },
    endPhase: { available: canChange, execute: (s, owner) => openContentChoice(s, owner, 'mountain.huashen', { timing: 'end' }) },
    choice: { silent: true, options: (s, owner, ctx, runtime) => [...(s.players[owner].huashen?.generals ?? []).flatMap(general => huashenSkills(runtime, general).map(ability => ({
      id: `avatar:${general}:${ability}`, label: `化身${runtime.content.general(general).label}，获得${runtime.content.requireSkill(ability).label}`,
    }))), ...(ctx.timing === 'initial' ? [] : [{ id: 'pass', label: '保留当前化身', pass: true }])],
      execute: (s, owner, ctx, a, runtime) => { if (a.type === 'pass') return;
        const [, general, ability] = a.choice.split(':'); const p = s.players[owner], avatar = p.huashen!;
        const previous = avatar.ability;
        p.gainedAbilities = (p.gainedAbilities ?? []).filter(id => id !== avatar.ability);
        avatar.selected = general; avatar.ability = ability; p.gainedAbilities.push(ability);
        const g = runtime.content.general(general); p.sex = g.sex ?? 'male'; p.group = g.group;
        if (ability !== previous) {
          const skill = runtime.content.requireSkill(ability);
          if (ctx.timing === 'start' && skill.startPhase) resolutionStack.enqueue(s, { kind: 'phaseStartOffer', owner, ability });
          if (ctx.timing === 'end' && skill.endPhase) resolutionStack.enqueue(s, { kind: 'phaseEndOffer', owner, ability });
        }
        emitEvent(s, 'huashenChanged', { player: owner, general, ability });
        emitEvent(s, 'skillActivated', { ability: 'mountain.huashen', label: '化身', owner, targets: [] });
      },
    },
  }, { id: 'mountain.xinsheng', label: '新生', trigger: { id: 'mountain.xinsheng', label: '新生', grantedBy: 'mountain.xinsheng', event: 'damageTaken', priority: 3, optional: true,
    owners: (_s, e) => [e.data.target], eligible: (_s, e, owner) => e.data.target === owner, repeats: (_s, e) => e.data.amount,
    execute: (s, _e, owner, runtime) => addAvatars(s, owner, 1, runtime!),
  } }] satisfies StandardGeneralModule['skills'];
}

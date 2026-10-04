import { standardContent } from '../content/standard/content.ts';
import { standardGeneralDefinitions } from '../content/standard/generals.ts';
import type { ContentRegistry, GeneralDefinition } from '../rules/content-registry.ts';
import { nextRngState } from '../domain/prng.ts';

export interface GeneralCandidate {
  id: string;
  label: string;
  sex: 'male' | 'female';
  group: 'wei' | 'shu' | 'wu' | 'qun';
  hp: number;
  skills: string[];
}
export interface DuelGeneralOffer {
  player: GeneralCandidate[];
  computer: GeneralCandidate[];
  computerPick: GeneralCandidate;
  demoPick: GeneralCandidate;
}

export function shuffleGenerals<T>(generals: readonly T[], seed: number): T[] {
  let state = (seed >>> 0) || 0x9e3779b9;
  const shuffled = [...generals];
  for (let index = shuffled.length - 1; index > 0; index--) {
    state = nextRngState(state);
    const swap = Math.floor(state / 4294967296 * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

/** Pregame presentation data; selecting a general never mutates the game RNG. */
export class DuelGeneralSelector {
  readonly generals: readonly GeneralDefinition[];
  readonly content: ContentRegistry;
  constructor(generals: readonly GeneralDefinition[] = standardGeneralDefinitions,
    content: ContentRegistry = standardContent) {
    this.generals = generals;
    this.content = content;
  }

  offer(seed: number): DuelGeneralOffer {
    if (!Number.isInteger(seed)) throw new Error('选将随机种子必须为整数');
    if (this.generals.length < 6 || new Set(this.generals.map(general => general.id)).size !== this.generals.length) {
      throw new Error('1v1 选将至少需要六名不同武将');
    }
    let state = (seed >>> 0) || 0x9e3779b9;
    const random = () => {
      state = nextRngState(state);
      return state / 4294967296;
    };
    const shuffled = [...this.generals];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swap = Math.floor(random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    const player = shuffled.slice(0, 3).map(general => this.describe(general, 'duel'));
    const computer = shuffled.slice(3, 6).map(general => this.describe(general, 'duel'));
    return { player, computer, computerPick: computer[Math.floor(random() * 3)],
      demoPick: player[Math.floor(random() * 3)] };
  }

  describe(general: GeneralDefinition, mode: 'duel' | 'identity'): GeneralCandidate {
    if (!general.sex || !general.group || !general.hp) throw new Error(`武将缺少选将展示信息：${general.id}`);
    return { id: general.id, label: general.label, sex: general.sex, group: general.group, hp: general.hp,
      skills: general.abilities.map(id => {
        const skill = this.content.requireSkill(id);
        return `${skill.label ?? id}${skill.lordSkill ? mode === 'duel' ? '（主公技，1v1不可用）' : '（主公技）' : ''}`;
      }) };
  }
}

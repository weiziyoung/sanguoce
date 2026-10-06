import type { Observation, VisiblePlayer } from '../../../../contracts.ts';
import { nullificationProtectsTarget } from './action-intent.ts';

const harmfulCards = new Set(['juedou', 'guohe', 'shunshou', 'jiedao', 'huogong']);
const helpfulSkills = new Set(['standard.qingnang', 'standard.jieyin']);
const hostileSkills = new Map([['standard.liuli', 0.3], ['standard.fanjian', 0.45],
  ['standard.tuxi', 0.25]]);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/** Mode relationships for the shared action evaluator. Uses only the actor's projected observation. */
export class RelationshipModel {
  readonly observation: Observation;
  constructor(observation: Observation) { this.observation = observation; }

  private player(id: number): VisiblePlayer | undefined {
    return id === this.observation.self.id ? this.observation.self :
      this.observation.others.find(player => player.id === id);
  }

  private lordAlignment(id: number): number {
    const role = this.player(id)?.role;
    if (role === 'lord' || role === 'loyalist') return 1;
    if (role === 'rebel') return -1;
    return 0;
  }

  private evidence(id: number): { alignment: number; personal: number } {
    let alignment = 0;
    let personal = 0;
    for (const event of this.observation.events) {
      if (event.kind === 'damaged' && event.data.source === id &&
          event.data.redirectedBy === undefined && event.data.forcedBy === undefined) {
        alignment -= 0.65 * this.lordAlignment(event.data.target);
        if (event.data.target === this.observation.self.id) personal -= 0.45;
      } else if (event.kind === 'attackDeclared' && event.data.source === id &&
          event.data.redirectedBy === undefined && event.data.forcedBy === undefined) {
        alignment -= 0.3 * this.lordAlignment(event.data.target);
        if (event.data.target === this.observation.self.id) personal -= 0.2;
      } else if (event.kind === 'cardUsed' && event.data.source === id) {
        const name = event.data.effectiveName ?? this.observation.eventCards?.[event.data.card]?.name;
        const weight = name === 'tao' ? 0.65 : name && harmfulCards.has(name) ? -0.3 : 0;
        if (weight) for (const target of event.data.targets) {
          alignment += weight * this.lordAlignment(target);
          if (target === this.observation.self.id && weight < 0) personal -= 0.2;
        }
      } else if (event.kind === 'gained' && event.data.from === id &&
          (event.data.cause === 'standard.rende' || event.data.cause === 'standard.yiji')) {
        alignment += 0.4 * this.lordAlignment(event.data.to);
      } else if (event.kind === 'rescued' && event.data.source === id) {
        alignment += 0.9 * this.lordAlignment(event.data.target);
      } else if (event.kind === 'delayPlaced' && event.data.source === id) {
        alignment -= 0.3 * this.lordAlignment(event.data.target);
      } else if (event.kind === 'skillActivated' && event.data.owner === id) {
        const weight = helpfulSkills.has(event.data.ability) ? 0.5 :
          event.data.ability === 'standard.lijian' ? -0.35 :
          -(hostileSkills.get(event.data.ability) ?? 0);
        for (const target of event.data.targets) alignment += weight * this.lordAlignment(target);
      } else if (event.kind === 'nullificationUsed' && event.data.player === id) {
        const protectsTarget = nullificationProtectsTarget(event.data.cname, event.data.parityBefore);
        if (protectsTarget !== null)
          alignment += (protectsTarget ? 0.8 : -0.8) * this.lordAlignment(event.data.target);
      }
    }
    return { alignment: clamp(alignment, -1, 1), personal: clamp(personal, -0.8, 0) };
  }

  private renegadeRelation(target: VisiblePlayer, alignment: number, personal: number): number {
    const living = [this.observation.self, ...this.observation.others].filter(player => player.alive);
    const lord = living.find(player => player.role === 'lord');
    if (living.length <= 2) return target.role === 'lord' ? -1 : -0.6;
    const lordWeak = Boolean(lord && lord.hp <= 2);
    if (target.role === 'lord') return lordWeak ? 0.85 : 0.2;
    // With only one third party left, the renegade must remove them before dueling the lord.
    if (living.length === 3) return clamp(-0.8 + personal, -1, -0.8);
    if (target.role === 'rebel') return lordWeak ? -0.85 : -0.3;
    if (target.role === 'loyalist') return lordWeak ? 0.2 : -0.55;
    return clamp((lordWeak ? alignment * 0.7 : -alignment * 0.4) + personal, -0.9, 0.7);
  }

  /** Positive means helping this target advances the actor's current objective. */
  relation(id: number): number {
    if (id === this.observation.self.id) return 1;
    const target = this.player(id);
    if (!target?.alive) return 0;
    if (this.observation.mode.id !== 'identity') return -1;
    const own = this.observation.self.role;
    const role = target.role;
    const { alignment, personal } = this.evidence(id);
    if (own === 'renegade') return this.renegadeRelation(target, alignment, personal);
    if (role) {
      if (own === 'rebel') return role === 'rebel' ? 1 : role === 'renegade' ? -0.2 : -1;
      if (own === 'lord' || own === 'loyalist') return role === 'lord' || role === 'loyalist' ? 1 :
        role === 'renegade' ? -0.35 : -1;
    }
    if (own === 'rebel') return clamp(-alignment + personal, -1, 0.9);
    if (own === 'lord' || own === 'loyalist') return clamp(alignment + personal, -1, 0.9);
    return personal;
  }
}

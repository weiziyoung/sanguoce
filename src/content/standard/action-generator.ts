import { cardText, type CardName } from "../../../catalog.ts";
import { leaf } from "../../core/decision-manager.ts";
import { alive, card, name, person, stealable } from "../../domain/state-access.ts";
import { type GameState, type InternalOption } from "../../domain/state.ts";
import { shaCosts, transformationAction, transformationCostLabel, transformationKey } from "./transforms.ts";
import { getStandardRuntime } from './runtime.ts';
import type { ContentRuntime } from '../../rules/content-runtime.ts';
import type { TargetRule } from '../../rules/content-registry.ts';
import { SkillFlow } from '../../rules/flows/skill-flow.ts';

function targetAllowed(s: GameState, actor: number, target: number, cardName: CardName,
  rule: TargetRule | undefined, runtime: ContentRuntime): boolean {
  if (!runtime.queries.canTarget(s, actor, target, cardName, runtime.content.card(cardName).play.allowSelf)) return false;
  switch (rule) {
    case 'distance1Stealable': return runtime.queries.distance(s, actor, target) <=
      runtime.queries.trickDistanceLimit(s, actor, cardName) && stealable(s, target).length > 0;
    case 'stealable': return stealable(s, target).length > 0;
    case 'uniqueTargetJudge': return !person(s, target).judge.some(id => name(s, id) === cardName);
    case 'hasHand': return person(s, target).hand.length > 0;
    case 'distance1UniqueJudge': return runtime.queries.distance(s, actor, target) <= runtime.queries.trickDistanceLimit(s, actor, cardName) &&
      !person(s, target).judge.some(id => name(s, id) === cardName);
    case 'armed': return person(s, target).equip.weapon !== null;
    default: return true;
  }
}

export function playOptions(s: GameState, runtime: ContentRuntime = getStandardRuntime()): InternalOption[] {
  const actor = s.active;
  const p = person(s, actor);
  const options: InternalOption[] = [];
  for (const cid of p.hand) {
    const c = card(s, cid);
    const cname = c.name;
    const { play } = runtime.content.card(cname);
    if (play.availability === 'drink' && (s.jiuUsed ?? 0) >= 1) continue;
    if (play.targeting === 'unplayable') continue;
    if (play.targeting === 'attack' && s.shaUsed >= runtime.queries.shaLimit(s, actor)) continue;
    if (play.availability === 'wounded' && p.hp >= p.maxHp) continue;
    if (play.availability === 'uniqueSelfJudge' && p.judge.some(id => name(s, id) === cname)) continue;
    const base = `play:${cid}`;
    const label = `使用${cardText(c)}`;
    if (play.targeting === 'attack') {
      const possible = alive(s).filter(id => runtime.queries.canSha(s, actor, id));
      const maxTargets = runtime.queries.shaTargets(s, actor);
      const groups = subsets(possible, maxTargets);
      if (groups.length) options.push({
        id: base, label,
        children: groups.map(ids => leaf(`${base}:${ids.join(":")}`,
          `目标：${ids.map(id => person(s, id).label).join("、")}`,
          { type: "play", cid, targets: ids })),
      });
      continue;
    }
    if (play.targeting === 'multiple') {
      const possible = alive(s).filter(id => (play.allowSelf || id !== actor) &&
        targetAllowed(s, actor, id, cname, play.targetRule, runtime));
      const choices = subsets(possible, play.maxTargets ?? 1).map(ids => leaf(`${base}:${ids.join(':')}`,
        `目标：${ids.map(id => person(s, id).label).join('、')}`, { type: 'play' as const, cid, targets: ids }));
      if (play.recast) choices.push(leaf(`recast:${cid}`, '重铸：弃置此牌并摸一张牌', { type: 'recast', cid }));
      if (choices.length) options.push({ id: base, label, children: choices });
      continue;
    }
    if (play.targeting === 'none') {
      options.push(leaf(base, label, { type: "play", cid, targets: [] }));
      continue;
    }
    const targets: InternalOption[] = [];
    for (const other of alive(s).filter(id => play.allowSelf || id !== actor)) {
      if (!targetAllowed(s, actor, other, cname, play.targetRule, runtime)) continue;
      if (play.targeting === 'borrowed') {
        const second = alive(s).filter(id => id !== other && runtime.queries.canSha(s, other, id));
        if (!second.length) continue;
        targets.push({
          id: `${base}:${other}`, label: `令${person(s, other).label}出【杀】`,
          children: second.map(id => leaf(`${base}:${other}:${id}`,
            `令${person(s, other).label}对${person(s, id).label}出【杀】`, {
            type: "play", cid, targets: [other, id],
          })),
        });
        continue;
      }
      targets.push(leaf(`${base}:${other}`, `目标：${person(s, other).label}`, {
        type: "play", cid, targets: [other],
      }));
    }
    if (targets.length) options.push({ id: base, label, children: targets });
  }
  if (s.shaUsed < runtime.queries.shaLimit(s, actor)) {
    const targets = alive(s).filter(id => runtime.queries.canSha(s, actor, id));
    if (targets.length) {
      const byAbility = new Map<string, ReturnType<typeof shaCosts>>();
      for (const cost of shaCosts(s, actor, runtime).filter(candidate => candidate.virtual)) {
        const key = cost.transformation!;
        byAbility.set(key, [...(byAbility.get(key) ?? []), cost]);
      }
      for (const [ability, costs] of byAbility) {
        const prefix = transformationKey(ability);
        const choices: InternalOption[] = costs.map(({ ids, transformation }) => ({
          id: `${prefix}:${ids.join(':')}`, label: transformationCostLabel(s, ids),
          children: targets.map(id => leaf(`${prefix}:${ids.join(':')}:${id}`, `目标：${person(s, id).label}`, {
            type: 'virtualSha', ids, targets: [id], ...transformationAction(transformation),
          })),
        }));
        const label = ability === 'standard.zhangba' ? '丈八蛇矛：两张手牌当【杀】' :
          `${runtime.content.skillForTransformation(ability).label ?? ability}：当【杀】使用`;
        options.push({ id: prefix, label, children: choices });
      }
    }
    if (s.mode.id === 'identity' && s.mode.roles[actor] === 'lord') {
      for (const skill of runtime.abilities.list(s, actor)) {
        const proxy = skill.proxyResponse;
        if (proxy?.produces !== 'sha' || !s.players.some(player => player.alive && player.id !== actor &&
          player.group === proxy.group && runtime.transforms.candidates(s, player.id, 'sha').length)) continue;
        const targets = alive(s).filter(id => runtime.queries.canSha(s, actor, id));
        if (targets.length) options.push({ id: `proxy-sha:${skill.id}`,
          label: `发动【${skill.label ?? skill.id}】请求同势力角色出【杀】`,
          children: targets.map(target => leaf(`proxy-sha:${skill.id}:${target}`,
            `目标：${person(s, target).label}`, { type: 'proxySha', ability: skill.id,
              targets: [target] })) });
      }
    }
  }
  for (const skill of runtime.abilities.list(s, actor)) {
    for (const transformation of [skill.transformation, ...(skill.transformations ?? [])].filter(
      (item): item is NonNullable<typeof item> => item !== undefined)) {
      const cname = transformation.produces;
      const definition = runtime.content.card(cname);
      if (!['trick', 'delay'].includes(definition.kind) || definition.play.targeting !== 'single') continue;
      const costs = runtime.transforms.candidates(s, actor, cname).filter(item =>
        item.virtual && item.transformation === transformation.id && item.ids.length === 1);
      const targets = alive(s).filter(id => id !== actor &&
        targetAllowed(s, actor, id, cname, definition.play.targetRule, runtime));
      const choices = costs.map(cost => ({
        id: `virtual-trick:${transformation.id}:${cost.ids.join(':')}`,
        label: transformationCostLabel(s, cost.ids),
        children: targets.map(target => leaf(`virtual-trick:${transformation.id}:${cost.ids.join(':')}:${target}`,
          `目标：${person(s, target).label}`, definition.kind === 'delay' ?
            { type: 'virtualDelay', cname, ids: cost.ids, targets: [target], transformation: transformation.id } :
            { type: 'virtualTrick', cname, ids: cost.ids, targets: [target], transformation: transformation.id })),
      })).filter(item => item.children.length);
      if (choices.length) options.push({ id: `virtual-trick:${transformation.id}`,
        label: `【${skill.label ?? skill.id}】当【${definition.label}】使用`, children: choices });
    }
  }
  options.push(...new SkillFlow(runtime).options(s, actor));
  options.push(leaf("end-play", "结束出牌阶段", { type: "endPlay" }));
  return options;
}

export function subsets(ids: number[], maxSize: number): number[][] {
  const result: number[][] = [];
  const visit = (start: number, current: number[]) => {
    if (current.length) result.push([...current]);
    if (current.length >= maxSize) return;
    for (let index = start; index < ids.length; index++) {
      current.push(ids[index]);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return result;
}

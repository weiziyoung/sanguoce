import { NAMES } from '../../catalog.ts';
import type { Observation } from '../../contracts.ts';
import type { VisibleEvent } from '../domain/events.ts';
import { nullificationProtectsTarget } from '../domain/action-intent.ts';

export interface ActionLink { from: number; to: number; label: string; helpful: boolean; }

/** Consumes the playback stream so a played Sha announces each target only once. */
export class ActionLinkRouter {
  private pendingAttacks = new Set<string>();

  links(event: VisibleEvent, obs: Observation): ActionLink[] {
    const links = actionLinks(event, obs);
    if (event.kind === 'cardUsed' || event.kind === 'turnStarted') this.pendingAttacks.clear();
    if (event.kind === 'cardUsed' &&
      (event.data.effectiveName ?? obs.eventCards?.[event.data.card]?.name) === 'sha') {
      for (const link of links) this.pendingAttacks.add(`${link.from}:${link.to}`);
    }
    if (event.kind === 'attackDeclared') {
      const announced = this.pendingAttacks.delete(`${event.data.source}:${event.data.target}`);
      if (announced && event.data.redirectedBy === undefined && event.data.forcedBy === undefined) return [];
    }
    return links;
  }
}

/** Public action relationships only. Local role notes and hidden identities never enter this projection. */
export function actionLinks(event: VisibleEvent, obs: Observation): ActionLink[] {
  const link = (from: number, to: number, label: string, helpful = false): ActionLink[] =>
    from === to ? [] : [{ from, to, label, helpful }];
  if (event.kind === 'attackDeclared') return link(event.data.source, event.data.target, '杀');
  if (event.kind === 'rescued') return link(event.data.source, event.data.target, '救援', true);
  if (event.kind === 'nullificationUsed') return link(event.data.player, event.data.target, '无懈可击',
    nullificationProtectsTarget(event.data.cname, event.data.parityBefore) ?? false);
  if (event.kind === 'delayPlaced') return link(event.data.source, event.data.target, '判定牌');
  if (event.kind === 'gained' && event.data.cause === 'standard.rende')
    return link(event.data.from, event.data.to, '仁德', true);
  if (event.kind === 'cardUsed') {
    const name = event.data.effectiveName ?? obs.eventCards?.[event.data.card]?.name;
    if (!name) return [];
    if (name === 'jiedao' && event.data.targets.length >= 2) {
      const [borrower, victim] = event.data.targets;
      return [...link(event.data.source, borrower, '借刀杀人'), ...link(borrower, victim, '杀')];
    }
    const helpful = name === 'tao' || name === 'taoyuan' || name === 'wugu';
    return event.data.targets.flatMap(target => link(event.data.source, target, NAMES[name], helpful));
  }
  if (event.kind === 'skillActivated') {
    const { ability, owner, targets, label } = event.data;
    if (ability === 'standard.rende') return []; // The per-card transfer below is the visible cue.
    if (ability === 'standard.lijian' && targets.length >= 2)
      return [...link(owner, targets[0], label), ...link(targets[0], targets[1], '决斗')];
    const helpful = ability === 'standard.rende' || ability === 'standard.qingnang' ||
      ability === 'standard.jieyin' || ability === 'standard.yiji';
    return targets.flatMap(target => link(owner, target, label, helpful));
  }
  return [];
}

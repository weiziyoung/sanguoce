import { NAMES, cardText } from '../../../../catalog.ts';
import { leaf } from '../../../core/decision-manager.ts';
import { card, handCards } from '../../../domain/state-access.ts';
import type { GameState, InternalOption } from '../../../domain/state.ts';
import type { ContentRuntime } from '../../../rules/content-runtime.ts';
import { transformationAction, transformationCostLabel, transformationKey } from '../transforms.ts';

export function responseOptions(state: GameState, actor: number, need: 'sha' | 'shan',
  baguaAllowed: boolean, runtime: ContentRuntime): InternalOption[] {
  const options = handCards(state, actor, need).map(cid =>
    leaf(`respond:${cid}`, `打出${cardText(card(state, cid))}`, { type: 'respond', ids: [cid] }));
  for (const cost of runtime.transforms.candidates(state, actor, need).filter(item => item.virtual)) {
    const ability = cost.transformation!;
    const label = runtime.content.skillForTransformation(ability).label ?? ability;
    options.push(leaf(`respond:${transformationKey(ability)}:${cost.ids.join(':')}`,
      `${label}：${transformationCostLabel(state, cost.ids)}当【${NAMES[need]}】`,
      { type: 'respond', ids: cost.ids, ...transformationAction(ability) }));
  }
  if (need === 'shan' && baguaAllowed) {
    options.push(leaf('respond:bagua', '发动【八卦阵】判定', { type: 'bagua' }));
  }
  options.push(leaf('respond:pass', `不打出【${NAMES[need]}】`, { type: 'pass' }));
  return options;
}

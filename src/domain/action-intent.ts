import type { CardName } from '../../catalog.ts';

const harmfulTricks = new Set<CardName>(['juedou', 'guohe', 'shunshou', 'lebu',
  'nanman', 'wanjian', 'jiedao', 'shandian']);
const helpfulTricks = new Set<CardName>(['taoyuan', 'wugu', 'wuzhong']);

/** Whether this counterspell protects its public target; null means the intent is ambiguous. */
export function nullificationProtectsTarget(cname: CardName, parityBefore: number): boolean | null {
  const cancels = parityBefore % 2 === 0;
  if (harmfulTricks.has(cname)) return cancels;
  if (helpfulTricks.has(cname)) return !cancels;
  return null;
}

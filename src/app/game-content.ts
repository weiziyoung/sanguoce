import { ContentRegistry } from '../rules/content-registry.ts';
import { standardContent, standardPack } from '../content/standard/content.ts';
import { junzhengPack } from '../content/junzheng/content.ts';

export type CardSet = 'standard' | 'junzheng';
export const expandedContent = new ContentRegistry([standardPack, junzhengPack]);
export function contentForCards(cards: CardSet = 'standard'): ContentRegistry {
  if (cards === 'standard') return standardContent;
  if (cards === 'junzheng') return expandedContent;
  throw new Error(`未知卡包组合：${cards}`);
}

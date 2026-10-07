import { ContentRegistry } from '../rules/content-registry.ts';
import { standardContent, standardPack } from '../content/standard/content.ts';
import { junzhengPack } from '../content/junzheng/content.ts';
import { windPack } from '../content/wind/content.ts';
import { firePack, fireVirtualCardsPack } from '../content/fire/content.ts';
export type CardSet = 'standard' | 'junzheng';
export type GeneralPack = 'wind' | 'fire';
export const GENERAL_PACKS: readonly GeneralPack[] = ['wind', 'fire'];
export const expandedContent = new ContentRegistry([standardPack, junzhengPack]);
export const allContent = new ContentRegistry([standardPack, junzhengPack, windPack, firePack]);
const cache = new Map<string, ContentRegistry>([['standard:', standardContent], ['junzheng:', expandedContent], ['junzheng:wind,fire', allContent]]);
export function contentForCards(cards: CardSet = 'standard', generalPacks: readonly GeneralPack[] = []): ContentRegistry {
  if (generalPacks.some(pack => !GENERAL_PACKS.includes(pack)) || new Set(generalPacks).size !== generalPacks.length) throw new Error('未知或重复的武将扩展包');
  if (!['standard', 'junzheng'].includes(cards)) throw new Error(`未知卡包组合：${cards}`);
  const packs = GENERAL_PACKS.filter(pack => generalPacks.includes(pack));
  const key = `${cards}:${packs.join(',')}`;
  if (!cache.has(key)) cache.set(key, new ContentRegistry([standardPack, ...(cards === 'junzheng' ? [junzhengPack] : packs.includes('fire') ? [fireVirtualCardsPack] : []),
    ...packs.map(pack => pack === 'wind' ? windPack : firePack)]));
  return cache.get(key)!;
}
export function generalPackLabel(packs: readonly GeneralPack[] = []): string {
  return GENERAL_PACKS.filter(pack => packs.includes(pack)).map(pack => pack === 'wind' ? '风包' : '火包').join('＋');
}

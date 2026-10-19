import { yijiang2011Pack } from '../content/yijiang2011/content.ts';
import { mountainPack } from '../content/mountain/content.ts';
import { forestPack, forestVirtualCardsPack } from '../content/forest/content.ts';
import { ContentRegistry } from '../rules/content-registry.ts';
import { standardContent, standardPack } from '../content/standard/content.ts';
import { junzhengPack } from '../content/junzheng/content.ts';
import { windPack } from '../content/wind/content.ts';
import { firePack, fireVirtualCardsPack } from '../content/fire/content.ts';
export type CardSet = 'standard' | 'junzheng';
export type GeneralPack = 'wind' | 'fire' | 'forest' | 'mountain' | 'yijiang2011';
export const GENERAL_PACKS: readonly GeneralPack[] = ['wind', 'fire', 'forest', 'mountain', 'yijiang2011'];
export const expandedContent = new ContentRegistry([standardPack, junzhengPack]);
export const allContent = new ContentRegistry([standardPack, junzhengPack, windPack, firePack, forestPack, mountainPack, yijiang2011Pack]);
const cache = new Map<string, ContentRegistry>([['standard:', standardContent], ['junzheng:', expandedContent], ['junzheng:wind,fire,forest,mountain,yijiang2011', allContent]]);
export function contentForCards(cards: CardSet = 'standard', generalPacks: readonly GeneralPack[] = []): ContentRegistry {
  if (generalPacks.some(pack => !GENERAL_PACKS.includes(pack)) || new Set(generalPacks).size !== generalPacks.length) throw new Error('未知或重复的武将扩展包');
  if (!['standard', 'junzheng'].includes(cards)) throw new Error(`未知卡包组合：${cards}`);
  const packs = GENERAL_PACKS.filter(pack => generalPacks.includes(pack));
  const key = `${cards}:${packs.join(',')}`;
  if (!cache.has(key)) cache.set(key, new ContentRegistry([standardPack, ...(cards === 'junzheng' ? [junzhengPack] : packs.includes('fire') ? [fireVirtualCardsPack] : []),
    ...(cards === 'standard' && packs.includes('forest') ? [forestVirtualCardsPack] : cards === 'standard' && packs.includes('yijiang2011') ? [{ id: 'yijiang2011.virtual-cards', cards: junzhengPack.cards.filter(c => c.id === 'jiu'), generals: [], skills: [], deck: [] }] : []),
    ...packs.map(pack => pack === 'wind' ? windPack : pack === 'fire' ? firePack : pack === 'forest' ? forestPack : pack === 'mountain' ? mountainPack : yijiang2011Pack)]));
  return cache.get(key)!;
}
export function generalPackLabel(packs: readonly GeneralPack[] = []): string {
  return GENERAL_PACKS.filter(pack => packs.includes(pack)).map(pack => pack === 'wind' ? '风包' : pack === 'fire' ? '火包' : pack === 'forest' ? '林包' : pack === 'mountain' ? '山包' : '一将成名2011').join('＋');
}

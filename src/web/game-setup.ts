import { BrowserDuel } from '../app/browser-duel.ts';
import { BrowserIdentity } from '../app/browser-identity.ts';
import { GENERAL_PACKS, type GeneralPack, type CardSet } from '../app/game-content.ts';

export type WebMode = 'duel' | 'identity';

export function cardsFromQuery(query: URLSearchParams): CardSet {
  return query.get('cards') === 'junzheng' ? 'junzheng' : 'standard';
}

export function generalPacksFromQuery(query: URLSearchParams): GeneralPack[] {
  const requested = query.get('generals')?.split(',') ?? [];
  return GENERAL_PACKS.filter(pack => requested.includes(pack));
}

/** Read the pack at click time so switching it applies to either game mode. */
export function bindModeSelection(root: Document, query: URLSearchParams,
  start: (mode: WebMode, cards: CardSet, generalPacks: GeneralPack[]) => void): void {
  const cards = cardsFromQuery(query);
  for (const value of ['standard', 'junzheng'] as const) {
    (root.getElementById(`cards-${value}`) as HTMLInputElement).checked = value === cards;
  }
  const expansions = GENERAL_PACKS.map(pack => ({ pack, input: root.getElementById(`generals-${pack}`) as HTMLInputElement | null }));
  for (const {pack, input} of expansions) if (input) input.checked = generalPacksFromQuery(query).includes(pack);
  for (const mode of ['duel', 'identity'] as const) {
    root.getElementById(`mode-${mode}`)!.onclick = () => {
      const expanded = (root.getElementById('cards-junzheng') as HTMLInputElement).checked;
      start(mode, expanded ? 'junzheng' : 'standard', expansions.filter(({input}) => input?.checked).map(({pack}) => pack));
    };
  }
}

export function createBrowserSession(mode: WebMode, seed: number, cards: CardSet, generalPacks: readonly GeneralPack[] = []) {
  return mode === 'identity' ? new BrowserIdentity(seed, cards, generalPacks) : new BrowserDuel(seed, cards, generalPacks);
}

/** A new game gets a new seed while retaining its chosen mode and card pack. */
export function gameUrl(pathname: string, cards: CardSet, mode?: WebMode, generalPacks: readonly GeneralPack[] = []): string {
  const query = new URLSearchParams();
  if (mode) query.set('mode', mode);
  query.set('cards', cards);
  const packs = GENERAL_PACKS.filter(pack => generalPacks.includes(pack));
  if (packs.length) query.set('generals', packs.join(','));
  return `${pathname}?${query}`;
}

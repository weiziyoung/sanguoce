import { BrowserDuel } from '../app/browser-duel.ts';
import { BrowserIdentity } from '../app/browser-identity.ts';
import type { CardSet } from '../app/game-content.ts';

export type WebMode = 'duel' | 'identity';

export function cardsFromQuery(query: URLSearchParams): CardSet {
  return query.get('cards') === 'junzheng' ? 'junzheng' : 'standard';
}

/** Read the pack at click time so switching it applies to either game mode. */
export function bindModeSelection(root: Document, query: URLSearchParams,
  start: (mode: WebMode, cards: CardSet) => void): void {
  const cards = cardsFromQuery(query);
  for (const value of ['standard', 'junzheng'] as const) {
    (root.getElementById(`cards-${value}`) as HTMLInputElement).checked = value === cards;
  }
  for (const mode of ['duel', 'identity'] as const) {
    root.getElementById(`mode-${mode}`)!.onclick = () => {
      const expanded = (root.getElementById('cards-junzheng') as HTMLInputElement).checked;
      start(mode, expanded ? 'junzheng' : 'standard');
    };
  }
}

export function createBrowserSession(mode: WebMode, seed: number, cards: CardSet) {
  return mode === 'identity' ? new BrowserIdentity(seed, cards) : new BrowserDuel(seed, cards);
}

/** A new game gets a new seed while retaining its chosen mode and card pack. */
export function gameUrl(pathname: string, cards: CardSet, mode?: WebMode): string {
  const query = new URLSearchParams();
  if (mode) query.set('mode', mode);
  query.set('cards', cards);
  return `${pathname}?${query}`;
}

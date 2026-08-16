// backend/src/utils/cardUtils.ts
// Pure stateless card helper functions.

export type CardCode = string;

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;

export function getCardRank(card: CardCode): string {
  return card.slice(0, -1);
}

export function getCardSuit(card: CardCode): string {
  return card.slice(-1);
}

export function isJoker(card: CardCode, jokerRank: string | null): boolean {
  return jokerRank !== null && getCardRank(card) === jokerRank;
}

export function createDeck(): CardCode[] {
  const deck: CardCode[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function isValidSet(cards: CardCode[], jokerRank: string | null): boolean {
  if (cards.length !== 3 && cards.length !== 4) return false;
  const naturals = cards.filter(c => !isJoker(c, jokerRank));
  if (naturals.length === 0) return true;
  const targetRank = getCardRank(naturals[0]);
  const allSameRank = naturals.every(c => getCardRank(c) === targetRank);
  if (!allSameRank) return false;
  const suits = naturals.map(getCardSuit);
  return suits.length === new Set(suits).size;
}

export function isValidPureSet(cards: CardCode[]): boolean {
  if (cards.length !== 4) return false;
  const targetRank = getCardRank(cards[0]);
  if (!cards.every(c => getCardRank(c) === targetRank)) return false;
  const suits = cards.map(getCardSuit);
  return new Set(suits).size === 4;
}

export function getCombinations<T>(array: T[], k: number): T[][] {
  const result: T[][] = [];
  function helper(start: number, combo: T[]): void {
    if (combo.length === k) { result.push([...combo]); return; }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

export function canFormThreeSets(cards: CardCode[], jokerRank: string | null): boolean {
  if (cards.length !== 9) return false;
  return backtrackSets(cards, [], jokerRank);
}

function backtrackSets(remaining: CardCode[], formed: CardCode[][], jokerRank: string | null): boolean {
  if (remaining.length === 0) return formed.length === 3;
  const c1 = remaining[0];
  for (let i = 1; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const group = [c1, remaining[i], remaining[j]];
      if (isValidSet(group, jokerRank)) {
        const next = remaining.filter((_, idx) => idx !== 0 && idx !== i && idx !== j);
        if (backtrackSets(next, [...formed, group], jokerRank)) return true;
      }
    }
  }
  return false;
}

export interface WinResult { pure: CardCode[]; others: CardCode[]; }

export function checkWinCondition(
  hand: CardCode[],
  revealedPureSet: CardCode[] | null,
  jokerRank: string,
  disclosed: boolean
): WinResult | false {
  const jRank = disclosed ? jokerRank : null;
  if (revealedPureSet) {
    return canFormThreeSets([...hand], jRank) ? { pure: revealedPureSet, others: hand } : false;
  }
  if (hand.length !== 13) return false;
  const rankGroups: Record<string, CardCode[]> = {};
  for (const card of hand) {
    const r = getCardRank(card);
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(card);
  }
  for (const r in rankGroups) {
    if (rankGroups[r].length >= 4) {
      for (const combo of getCombinations(rankGroups[r], 4)) {
        if (isValidPureSet(combo)) {
          const remaining = hand.filter(c => !combo.includes(c));
          if (canFormThreeSets(remaining, jRank)) return { pure: combo, others: remaining };
        }
      }
    }
  }
  return false;
}

export interface Groupings {
  pureSet: CardCode[] | null;
  additionalSets: CardCode[][];
  unusedCards: CardCode[];
}

export function findBestGroupings(hand: CardCode[], jokerRank: string, disclosed: boolean): Groupings {
  const jRank = disclosed ? jokerRank : null;
  const nJokers = hand.filter(c => isJoker(c, jRank));
  const naturals = hand.filter(c => !isJoker(c, jRank));

  const rankGroups: Record<string, CardCode[]> = {};
  for (const card of naturals) {
    const r = getCardRank(card);
    if (!rankGroups[r]) rankGroups[r] = [];
    if (!rankGroups[r].some(c => getCardSuit(c) === getCardSuit(card))) {
      rankGroups[r].push(card);
    }
  }

  let pureSet: CardCode[] | null = null;
  const remainingRanks = { ...rankGroups };
  for (const r in remainingRanks) {
    if (remainingRanks[r].length === 4) {
      pureSet = [...remainingRanks[r]];
      delete remainingRanks[r];
      break;
    }
  }

  const additionalSets: CardCode[][] = [];
  const unusedCards: CardCode[] = [];
  const jokersAvailable = [...nJokers];
  const sortedRanks = Object.keys(remainingRanks).sort((a, b) => remainingRanks[b].length - remainingRanks[a].length);

  for (const r of sortedRanks) {
    const group = remainingRanks[r];
    if (group.length >= 3) {
      additionalSets.push(group);
    } else if (group.length === 2 && jokersAvailable.length >= 1) {
      additionalSets.push([...group, jokersAvailable.pop()!]);
    } else if (group.length === 1 && jokersAvailable.length >= 2) {
      additionalSets.push([...group, jokersAvailable.pop()!, jokersAvailable.pop()!]);
    } else {
      unusedCards.push(...group);
    }
  }
  while (jokersAvailable.length >= 3) {
    additionalSets.push([jokersAvailable.pop()!, jokersAvailable.pop()!, jokersAvailable.pop()!]);
  }
  unusedCards.push(...jokersAvailable);
  return { pureSet, additionalSets, unusedCards };
}

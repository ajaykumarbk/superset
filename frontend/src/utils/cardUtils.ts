// frontend/src/utils/cardUtils.ts
export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUIT_SYMBOLS: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;

export function getRank(cardCode: string): string { return cardCode.slice(0, -1); }
export function getSuit(cardCode: string): Suit   { return cardCode.slice(-1) as Suit; }
export function isRed(cardCode: string): boolean  { const s = getSuit(cardCode); return s === 'H' || s === 'D'; }
export function suitSymbol(cardCode: string): string { return SUIT_SYMBOLS[getSuit(cardCode)] ?? ''; }

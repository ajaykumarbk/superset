// frontend/src/types.ts
// Shared TypeScript interfaces for the Superset frontend.

export type CardCode = string; // e.g. "AS", "10H"

export interface PlayerState {
  id: string;
  username: string;
  cardCount: number;
  hand: CardCode[];
  revealedPureSet: CardCode[] | null;
  isAI: boolean;
  online: boolean;
}

export interface RoomState {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  jokerDisclosed: boolean;
  hiddenJoker: CardCode | null;
  firstRevealer: string | null;
  turnIndex: number;
  turnCount: number;
  winnerId: string | null;
  deckCount: number;
  discardPile: CardCode[];
  topDiscard: CardCode | null;
  maxPlayers: number;
  players: PlayerState[];
}

export interface CurrentUser {
  id: number | string;
  username: string;
}

export interface GameOverData {
  winnerId: string;
  winnerUsername: string;
  finalHands: { id: string; username: string; hand: CardCode[]; revealedPureSet: CardCode[] | null }[];
  joker: CardCode;
}

export interface QueueStatus {
  position: number;
  needed: number;
}

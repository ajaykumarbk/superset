// backend/src/types.ts
// Shared type definitions for the Superset game server.

export type CardCode = string; // e.g. "AS", "10H", "KD"
export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A';

export interface Player {
  id: string;
  username: string;
  hand: CardCode[];
  revealedPureSet: CardCode[] | null;
  isAI: boolean;
  socketId: string | null;
  turnsSinceReveal?: number;
}

export interface Room {
  id: string;
  status: 'waiting' | 'playing' | 'finished';
  maxPlayers: number;
  players: Player[];
  deck: CardCode[];
  discardPile: CardCode[];
  hiddenJoker: CardCode | null;
  jokerDisclosed: boolean;
  firstRevealer: string | null;
  turnIndex: number;
  turnCount: number;
  winnerId: string | null;
  alreadyNotifiedDisclosed?: boolean;
}

export interface PublicPlayer {
  id: string;
  username: string;
  cardCount: number;
  hand: CardCode[];
  revealedPureSet: CardCode[] | null;
  isAI: boolean;
  online: boolean;
}

export interface PublicRoomState {
  id: string;
  status: string;
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
  players: PublicPlayer[];
}

export interface QueueEntry {
  userId: string;
  username: string;
  socketId: string;
  socket: import('socket.io').Socket;
}

export interface Groupings {
  pureSet: CardCode[] | null;
  additionalSets: CardCode[][];
  unusedCards: CardCode[];
}

export interface WinResult {
  pure: CardCode[];
  others: CardCode[];
}

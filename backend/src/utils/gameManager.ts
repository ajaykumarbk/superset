// backend/src/utils/gameManager.ts
import { GameHistoryModel } from '../models/GameHistory';
import {
  CardCode, createDeck, shuffle, isJoker, getCardRank, getCardSuit,
  isValidPureSet, findBestGroupings, checkWinCondition, findBestGroupings as _fbg,
} from './cardUtils';

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

export const rooms = new Map<string, Room>();

export function createRoom(
  roomId: string,
  creatorId: string,
  creatorUsername: string,
  maxPlayers: number | string = 3
): Room {
  const isVsBot = maxPlayers === '1vbot';
  const parsedMax = isVsBot ? 2 : Math.max(2, Math.min(6, parseInt(String(maxPlayers)) || 3));

  const room: Room = {
    id: roomId,
    status: 'waiting',
    maxPlayers: parsedMax,
    players: [{ id: creatorId, username: creatorUsername, hand: [], revealedPureSet: null, isAI: false, socketId: null }],
    deck: [],
    discardPile: [],
    hiddenJoker: null,
    jokerDisclosed: false,
    firstRevealer: null,
    turnIndex: 0,
    turnCount: 0,
    winnerId: null,
  };

  if (isVsBot) {
    room.players.push({ id: 'AI_2', username: 'Bot 1', hand: [], revealedPureSet: null, isAI: true, socketId: null });
  }

  rooms.set(roomId, room);
  return room;
}

export function joinRoom(roomId: string, playerId: string, playerUsername: string): Room & { error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' } as Room & { error: string };
  if (room.status !== 'waiting') return { ...room, error: 'Game already started' };
  if (room.players.length >= room.maxPlayers) return { ...room, error: 'Room is full' };
  if (room.players.some(p => p.id === playerId)) return room;

  room.players.push({ id: playerId, username: playerUsername, hand: [], revealedPureSet: null, isAI: false, socketId: null });
  return room;
}

export function startGame(roomId: string): Room & { error?: string } {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' } as Room & { error: string };

  const startingCount = room.players.length;
  for (let i = startingCount + 1; i <= room.maxPlayers; i++) {
    room.players.push({ id: `AI_${i}`, username: `Bot ${i - 1}`, hand: [], revealedPureSet: null, isAI: true, socketId: null });
  }

  const numDecks = room.maxPlayers >= 4 ? 2 : 1;
  let deck: CardCode[] = [];
  for (let d = 0; d < numDecks; d++) deck.push(...createDeck());
  deck = shuffle(deck);

  for (const player of room.players) {
    player.hand = [];
    for (let j = 0; j < 13; j++) player.hand.push(deck.pop()!);
  }

  const jokerIndex = Math.floor(Math.random() * deck.length);
  room.hiddenJoker = deck.splice(jokerIndex, 1)[0];
  room.discardPile = [deck.pop()!];
  room.deck = deck;
  room.jokerDisclosed = false;
  room.firstRevealer = null;
  room.status = 'playing';
  room.turnIndex = 0;
  room.turnCount = 0;
  room.winnerId = null;

  return room;
}

export function resetDrawDeck(room: Room): void {
  if (room.discardPile.length <= 1) return;
  const topDiscard = room.discardPile.pop()!;
  room.deck = shuffle([...room.discardPile]);
  room.discardPile = [topDiscard];
  console.log(`Room ${room.id}: Draw pile replenished from discard pile.`);
}

export interface AIMoveResult {
  action: 'win' | 'discard';
  discardedCard?: CardCode;
  drewFromDiscard: boolean;
  revealedNow: boolean;
}

export function makeAIMove(room: Room, aiPlayer: Player): AIMoveResult {
  const isFirstRevealer = room.firstRevealer === aiPlayer.id;
  const knowsJoker = room.jokerDisclosed || isFirstRevealer;
  const jokerRank = getCardRank(room.hiddenJoker!);
  const jRank = knowsJoker ? jokerRank : null;
  const topDiscard = room.discardPile[room.discardPile.length - 1];
  let drewFromDiscard = false;

  if (topDiscard) {
    if (knowsJoker && isJoker(topDiscard, jokerRank)) {
      aiPlayer.hand.push(topDiscard);
      room.discardPile.pop();
      drewFromDiscard = true;
    } else {
      const currentGroups = findBestGroupings(aiPlayer.hand, jokerRank, knowsJoker);
      const testGroups = findBestGroupings([...aiPlayer.hand, topDiscard], jokerRank, knowsJoker);
      const cur = (currentGroups.pureSet ? 1 : 0) + currentGroups.additionalSets.length;
      const tst = (testGroups.pureSet ? 1 : 0) + testGroups.additionalSets.length;
      if (tst > cur || (testGroups.pureSet && !currentGroups.pureSet)) {
        aiPlayer.hand.push(topDiscard);
        room.discardPile.pop();
        drewFromDiscard = true;
      }
    }
  }

  if (!drewFromDiscard) aiPlayer.hand.push(room.deck.pop()!);

  let revealedNow = false;
  if (!aiPlayer.revealedPureSet) {
    const groupings = findBestGroupings(aiPlayer.hand, jokerRank, knowsJoker);
    if (groupings.pureSet) {
      aiPlayer.revealedPureSet = groupings.pureSet;
      aiPlayer.hand = aiPlayer.hand.filter(c => !groupings.pureSet!.includes(c));
      revealedNow = true;
      if (!room.firstRevealer) room.firstRevealer = aiPlayer.id;
    }
  }

  if (room.firstRevealer === aiPlayer.id && !room.jokerDisclosed) {
    if (!aiPlayer.turnsSinceReveal) aiPlayer.turnsSinceReveal = 0;
    aiPlayer.turnsSinceReveal++;
    const g = findBestGroupings(aiPlayer.hand, jokerRank, true);
    if (g.additionalSets.length >= 2 || aiPlayer.turnsSinceReveal >= 3) room.jokerDisclosed = true;
  }

  let winningDiscard: CardCode | null = null;
  let winningPureSet: CardCode[] | null = null;

  if (!aiPlayer.revealedPureSet) {
    for (const card of aiPlayer.hand) {
      const remaining = aiPlayer.hand.filter(c => c !== card);
      const win = checkWinCondition(remaining, null, jokerRank, room.jokerDisclosed);
      if (win) { winningDiscard = card; winningPureSet = win.pure; break; }
    }
  } else {
    for (const card of aiPlayer.hand) {
      const remaining = aiPlayer.hand.filter(c => c !== card);
      const win = checkWinCondition(remaining, aiPlayer.revealedPureSet, jokerRank, room.jokerDisclosed);
      if (win) { winningDiscard = card; break; }
    }
  }

  if (winningDiscard) {
    if (winningPureSet) {
      aiPlayer.revealedPureSet = winningPureSet;
      aiPlayer.hand = aiPlayer.hand.filter(c => !winningPureSet!.includes(c));
      revealedNow = true;
      if (!room.firstRevealer) room.firstRevealer = aiPlayer.id;
    }
    aiPlayer.hand = aiPlayer.hand.filter(c => c !== winningDiscard);
    room.discardPile.push(winningDiscard!);
    return { action: 'win', drewFromDiscard, revealedNow };
  }

  const groupings = findBestGroupings(aiPlayer.hand, jokerRank, knowsJoker);
  let discardCard: CardCode;
  if (groupings.unusedCards.length > 0) {
    const nonJoker = groupings.unusedCards.filter(c => !isJoker(c, jRank));
    discardCard = nonJoker.length > 0 ? nonJoker[0] : groupings.unusedCards[0];
  } else if (groupings.additionalSets.length > 0) {
    const sorted = [...groupings.additionalSets].sort((a, b) => b.length - a.length);
    discardCard = sorted[0][sorted[0].length - 1];
  } else {
    discardCard = aiPlayer.hand[0];
  }

  aiPlayer.hand = aiPlayer.hand.filter(c => c !== discardCard);
  room.discardPile.push(discardCard);
  if (room.deck.length === 0) resetDrawDeck(room);

  return { action: 'discard', discardedCard: discardCard, drewFromDiscard, revealedNow };
}

export { isValidPureSet, getCardRank, getCardSuit, checkWinCondition };
export async function persistGameResult(room: Room): Promise<void> {
  try {
    await GameHistoryModel.persistResult(room);
  } catch (err) {
    console.error('Error persisting game result:', err);
  }
}

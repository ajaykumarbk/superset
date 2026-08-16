// backend/src/index.ts
import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cookieSession from 'cookie-session';
import path from 'path';

import { initDatabase } from './config/database';
import { ENV } from './config/env';
import authRoutes from './routes/auth';
import gameRoutes from './routes/game';
import * as gm from './utils/gameManager';
import { getCardRank, checkWinCondition } from './utils/cardUtils';
import type { Room, Player } from './utils/gameManager';

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'session',
  keys: [ENV.SESSION_SECRET],
  maxAge: 24 * 60 * 60 * 1000,
}));
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// ── REST Routes ───────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', gameRoutes);

// ── DB Init ───────────────────────────────────────────────────────────────────
initDatabase().catch(err => { console.error('DB init failed:', err); process.exit(1); });

// ── Matchmaking Queues ────────────────────────────────────────────────────────
interface QueueEntry { userId: string; username: string; socketId: string; socket: Socket; }

const queue2: QueueEntry[]               = [];
const queue6: QueueEntry[]               = [];
const matchmakingTimers                  = new Map<string, ReturnType<typeof setTimeout>>();

function broadcastQueueStatus(queue: QueueEntry[], capacity: number): void {
  queue.forEach(p => p.socket.emit('matchmaking_status', { position: queue.length, needed: capacity }));
}

function removeFromQueues(userId: string): void {
  const clear = (q: QueueEntry[], cap: number): void => {
    const idx = q.findIndex(p => p.userId === userId);
    if (idx > -1) { q.splice(idx, 1); broadcastQueueStatus(q, cap); }
  };
  if (matchmakingTimers.has(userId)) { clearTimeout(matchmakingTimers.get(userId)!); matchmakingTimers.delete(userId); }
  clear(queue2, 2);
  clear(queue6, 6);
}

function handleQueueDisconnect(socketId: string): void {
  const handle = (q: QueueEntry[], cap: number): void => {
    const idx = q.findIndex(p => p.socketId === socketId);
    if (idx > -1) {
      const entry = q[idx];
      clearTimeout(matchmakingTimers.get(entry.userId)!);
      matchmakingTimers.delete(entry.userId);
      q.splice(idx, 1);
      broadcastQueueStatus(q, cap);
      console.log(`User ${entry.username} disconnected from ${cap}P queue.`);
    }
  };
  handle(queue2, 2);
  handle(queue6, 6);
}

function matchPlayers(queue: QueueEntry[], capacity: number): void {
  const matched = queue.splice(0, capacity);
  matched.forEach(p => { clearTimeout(matchmakingTimers.get(p.userId)!); matchmakingTimers.delete(p.userId); });

  const roomId = `Table_${Date.now()}`;
  const p1 = matched[0];
  const room = gm.createRoom(roomId, p1.userId, p1.username, capacity);
  p1.socket.join(roomId);
  const rp1 = room.players.find(p => p.id === p1.userId);
  if (rp1) rp1.socketId = p1.socketId;

  for (let i = 1; i < matched.length; i++) {
    const p = matched[i];
    gm.joinRoom(roomId, p.userId, p.username);
    p.socket.join(roomId);
    const rp = room.players.find(pl => pl.id === p.userId);
    if (rp) rp.socketId = p.socketId;
  }

  gm.startGame(roomId);
  console.log(`Matchmaking completed: Room ${roomId} automatically started (${capacity} players)`);
  sendRoomStateToAll(room);
  sendRoomListUpdate();
}

function triggerQueueTimeout(userId: string, format: string): void {
  const q = format === '2players' ? queue2 : queue6;
  const capacity = format === '2players' ? 2 : 6;
  const idx = q.findIndex(p => p.userId === userId);
  if (idx === -1) return;

  const player = q.splice(idx, 1)[0];
  broadcastQueueStatus(q, capacity);
  matchmakingTimers.delete(userId);

  const roomId = `Table_${Date.now()}_Auto`;
  const room = gm.createRoom(roomId, player.userId, player.username, capacity);
  player.socket.join(roomId);
  const rp = room.players.find(p => p.id === player.userId);
  if (rp) rp.socketId = player.socketId;

  gm.startGame(roomId);
  console.log(`Matchmaking timeout: Room ${roomId} started with Bot backfill.`);
  sendRoomStateToAll(room);
  sendRoomListUpdate();
}

// ── Socket.io ─────────────────────────────────────────────────────────────────
io.on('connection', (socket: Socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join_lobby', () => { socket.join('lobby'); sendRoomListUpdate(); });

  socket.on('join_matchmaking', ({ format, userId, username }: { format: string; userId: string | number; username: string }) => {
    if (!format || !userId) return;
    const uId = userId.toString();

    if (format === '1vbot') {
      const roomId = `Practice_${socket.id}_${Date.now()}`;
      const room = gm.createRoom(roomId, uId, username, '1vbot');
      socket.join(roomId);
      const player = room.players.find(p => p.id === uId);
      if (player) player.socketId = socket.id;
      gm.startGame(roomId);
      console.log(`Practice table created for ${username}: ${roomId}`);
      sendRoomStateToAll(room);
      sendRoomListUpdate();
      return;
    }

    const q = format === '2players' ? queue2 : queue6;
    const capacity = format === '2players' ? 2 : 6;
    removeFromQueues(uId);
    q.push({ userId: uId, username, socketId: socket.id, socket });
    console.log(`User ${username} joined matchmaking for ${format}. Queue size: ${q.length}`);
    broadcastQueueStatus(q, capacity);

    if (q.length >= capacity) {
      matchPlayers(q, capacity);
    } else {
      matchmakingTimers.set(uId, setTimeout(() => triggerQueueTimeout(uId, format), 7000));
    }
  });

  socket.on('leave_matchmaking', ({ userId }: { userId: string | number }) => {
    if (!userId) return;
    removeFromQueues(userId.toString());
  });

  socket.on('create_room', ({ roomId, userId, username, maxPlayers }: { roomId: string; userId: string | number; username: string; maxPlayers: number }) => {
    if (!roomId) return;
    const room = gm.createRoom(roomId, userId.toString(), username, maxPlayers);
    socket.join(roomId);
    const player = room.players.find(p => p.id === userId.toString());
    if (player) player.socketId = socket.id;
    io.to(roomId).emit('room_state', getPublicRoomState(room, userId.toString()));
    sendRoomListUpdate();
  });

  socket.on('join_room', ({ roomId, userId, username }: { roomId: string; userId: string | number; username: string }) => {
    if (!roomId) return;
    const room = gm.joinRoom(roomId, userId.toString(), username);
    if ((room as { error?: string }).error) { socket.emit('error_message', (room as { error: string }).error); return; }
    socket.join(roomId);
    const player = room.players.find(p => p.id === userId.toString());
    if (player) player.socketId = socket.id;
    io.to(roomId).emit('room_state', getPublicRoomState(room, userId.toString()));
    sendRoomListUpdate();
  });

  socket.on('start_game', ({ roomId }: { roomId: string }) => {
    const room = gm.rooms.get(roomId);
    if (!room) return;
    gm.startGame(roomId);
    sendRoomStateToAll(room);
    sendRoomListUpdate();
  });

  socket.on('draw_card', ({ roomId, userId, source }: { roomId: string; userId: string | number; source: 'deck' | 'discard' }) => {
    const room = gm.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) { socket.emit('error_message', 'It is not your turn!'); return; }
    const expected = activePlayer.revealedPureSet ? 9 : 13;
    if (activePlayer.hand.length !== expected) { socket.emit('error_message', 'You have already drawn a card! Discard to end turn.'); return; }

    let drawnCard: string | undefined;
    if (source === 'deck') drawnCard = room.deck.pop();
    else if (source === 'discard') drawnCard = room.discardPile.pop();
    if (!drawnCard) { socket.emit('error_message', 'Deck/Discard pile is empty.'); return; }

    activePlayer.hand.push(drawnCard);
    if (room.deck.length === 0) gm.resetDrawDeck(room);
    console.log(`Player ${activePlayer.username} drew ${drawnCard} from ${source}`);
    sendRoomStateToAll(room);
  });

  socket.on('discard_card', ({ roomId, userId, card }: { roomId: string; userId: string | number; card: string }) => {
    const room = gm.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) { socket.emit('error_message', 'It is not your turn!'); return; }
    const expected = activePlayer.revealedPureSet ? 10 : 14;
    if (activePlayer.hand.length !== expected) { socket.emit('error_message', 'You must draw a card before discarding!'); return; }
    if (!activePlayer.hand.includes(card)) { socket.emit('error_message', 'Card not in hand!'); return; }

    activePlayer.hand = activePlayer.hand.filter(c => c !== card);
    room.discardPile.push(card);
    console.log(`Player ${activePlayer.username} discarded ${card}`);
    if (room.deck.length === 0) gm.resetDrawDeck(room);
    advanceTurn(room);
  });

  socket.on('reveal_pure_set', ({ roomId, userId, cards }: { roomId: string; userId: string | number; cards: string[] }) => {
    const room = gm.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) { socket.emit('error_message', 'You can only reveal your Pure Set on your turn!'); return; }
    if (activePlayer.revealedPureSet) { socket.emit('error_message', 'You have already revealed your pure set!'); return; }
    if (activePlayer.hand.length !== 14) { socket.emit('error_message', 'You must draw a card before revealing your Pure Set!'); return; }
    if (!cards.every(c => activePlayer.hand.includes(c))) { socket.emit('error_message', 'Selected cards are not all in hand.'); return; }
    if (!gm.isValidPureSet(cards)) { socket.emit('error_message', 'Invalid Pure Set! Must be 4 cards of the same rank, one of each suit.'); return; }

    activePlayer.revealedPureSet = cards;
    activePlayer.hand = activePlayer.hand.filter(c => !cards.includes(c));
    console.log(`Player ${activePlayer.username} revealed pure set: ${cards.join(', ')}`);

    let peekingStatus = false;
    if (!room.firstRevealer) { room.firstRevealer = uId; peekingStatus = true; }

    const allRevealed = room.players.every(p => p.revealedPureSet !== null);
    if (allRevealed && !room.jokerDisclosed) {
      room.jokerDisclosed = true;
      io.to(roomId).emit('joker_disclosed', { joker: room.hiddenJoker });
    }

    sendRoomStateToAll(room);
    if (peekingStatus) socket.emit('joker_peek', { joker: room.hiddenJoker });
  });

  socket.on('disclose_joker', ({ roomId, userId }: { roomId: string; userId: string | number }) => {
    const room = gm.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const uId = userId.toString();
    if (room.firstRevealer !== uId) { socket.emit('error_message', 'Only the first revealer can disclose the joker!'); return; }
    if (room.jokerDisclosed) return;
    room.jokerDisclosed = true;
    io.to(roomId).emit('joker_disclosed', { joker: room.hiddenJoker });
    sendRoomStateToAll(room);
  });

  socket.on('declare_win', async ({ roomId, userId, discardCard }: { roomId: string; userId: string | number; discardCard: string }) => {
    const room = gm.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;
    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) { socket.emit('error_message', 'It is not your turn!'); return; }
    if (!activePlayer.revealedPureSet) { socket.emit('error_message', 'You must reveal a pure set before declaring a win!'); return; }
    if (activePlayer.hand.length !== 10) { socket.emit('error_message', 'You must draw a card first to declare a win!'); return; }
    if (!discardCard || !activePlayer.hand.includes(discardCard)) { socket.emit('error_message', 'Select exactly 1 card to discard/show to declare a win!'); return; }

    const remaining = activePlayer.hand.filter(c => c !== discardCard);
    const jokerRank = getCardRank(room.hiddenJoker!);
    const win = checkWinCondition(remaining, activePlayer.revealedPureSet, jokerRank, room.jokerDisclosed);

    if (win) {
      activePlayer.hand = remaining;
      room.discardPile.push(discardCard);
      room.status = 'finished';
      room.winnerId = uId;
      console.log(`Player ${activePlayer.username} declared win and WON!`);
      await gm.persistGameResult(room);
      io.to(roomId).emit('game_over', {
        winnerId: uId, winnerUsername: activePlayer.username,
        finalHands: room.players.map(p => ({ id: p.id, username: p.username, hand: p.hand, revealedPureSet: p.revealedPureSet })),
        joker: room.hiddenJoker,
      });
      sendRoomListUpdate();
    } else {
      socket.emit('error_message', 'Invalid win! Remaining 9 cards must form three valid sets.');
    }
  });

  socket.on('disconnect', () => {
    handleQueueDisconnect(socket.id);
    console.log(`Socket disconnected: ${socket.id}`);
    for (const [roomId, room] of gm.rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.socketId = null;
        console.log(`Player ${player.username} disconnected from room ${roomId}`);
        const activeHumans = room.players.filter(p => !p.isAI && p.socketId !== null);
        if (activeHumans.length === 0 && room.status !== 'finished') {
          gm.rooms.delete(roomId);
        } else {
          io.to(roomId).emit('room_state', getPublicRoomState(room, null));
        }
        sendRoomListUpdate();
        break;
      }
    }
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function advanceTurn(room: Room): void {
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  room.turnCount++;
  sendRoomStateToAll(room);
  const next = room.players[room.turnIndex];
  if (next.isAI && room.status === 'playing') setTimeout(() => handleAITurn(room, next), 1500);
}

async function handleAITurn(room: Room, aiPlayer: Player): Promise<void> {
  if (room.status !== 'playing' || room.players[room.turnIndex].id !== aiPlayer.id) return;
  const result = gm.makeAIMove(room, aiPlayer);
  console.log(`AI Bot ${aiPlayer.username} moved:`, result);

  io.to(room.id).emit('game_log', result.drewFromDiscard
    ? `${aiPlayer.username} drew from the Discard pile.`
    : `${aiPlayer.username} drew from the Draw deck.`);

  if (result.revealedNow) io.to(room.id).emit('game_log', `${aiPlayer.username} revealed their Pure Set of four!`);

  if (result.action === 'win') {
    room.status = 'finished';
    room.winnerId = aiPlayer.id;
    await gm.persistGameResult(room);
    io.to(room.id).emit('game_over', {
      winnerId: aiPlayer.id, winnerUsername: aiPlayer.username,
      finalHands: room.players.map(p => ({ id: p.id, username: p.username, hand: p.hand, revealedPureSet: p.revealedPureSet })),
      joker: room.hiddenJoker,
    });
    sendRoomListUpdate();
  } else {
    io.to(room.id).emit('game_log', `${aiPlayer.username} discarded ${result.discardedCard}.`);
    if (room.jokerDisclosed && !room.alreadyNotifiedDisclosed) {
      room.alreadyNotifiedDisclosed = true;
      io.to(room.id).emit('joker_disclosed', { joker: room.hiddenJoker });
    }
    const allRevealed = room.players.every(p => p.revealedPureSet !== null);
    if (allRevealed && !room.jokerDisclosed) {
      room.jokerDisclosed = true;
      room.alreadyNotifiedDisclosed = true;
      io.to(room.id).emit('joker_disclosed', { joker: room.hiddenJoker });
    }
    advanceTurn(room);
  }
}

function getPublicRoomState(room: Room, playerId: string | null) {
  return {
    id: room.id, status: room.status,
    jokerDisclosed: room.jokerDisclosed,
    hiddenJoker: room.jokerDisclosed ? room.hiddenJoker : null,
    firstRevealer: room.firstRevealer,
    turnIndex: room.turnIndex, turnCount: room.turnCount, winnerId: room.winnerId,
    deckCount: room.deck.length, discardPile: room.discardPile,
    topDiscard: room.discardPile[room.discardPile.length - 1] ?? null,
    maxPlayers: room.maxPlayers,
    players: room.players.map(p => ({
      id: p.id, username: p.username, cardCount: p.hand.length,
      hand: p.id === playerId ? p.hand : [],
      revealedPureSet: p.revealedPureSet,
      isAI: p.isAI, online: p.isAI || p.socketId !== null,
    })),
  };
}

function sendRoomStateToAll(room: Room): void {
  room.players.forEach(p => {
    if (!p.isAI && p.socketId) io.to(p.socketId).emit('room_state', getPublicRoomState(room, p.id));
  });
}

function sendRoomListUpdate(): void {
  const list = Array.from(gm.rooms.values()).map(r => ({ id: r.id, status: r.status, playerCount: r.players.length, maxPlayers: r.maxPlayers }));
  io.to('lobby').emit('room_list', list);
}

// ── SPA Fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '../../frontend/dist/index.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(ENV.PORT, () => console.log(`Superset game server running on port ${ENV.PORT}`));

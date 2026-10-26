// backend/server.js
require('dotenv').config();   // ← loads .env before anything else

const express = require('express');
const http = require('http');
const { Server } = require('socket.io')
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const path = require('path');
const { pool, initDatabase } = require('./database');
const gameManager = require('./gameManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieSession({
  name: 'session',
  keys: [process.env.SESSION_SECRET || 'superset-secret-key-12345'],
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Serve React build static files
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Initialize DB schema on start
initDatabase().catch(err => {
  console.error('Failed to initialize database, exiting...', err);
  process.exit(1);
});

/**
 * Authentication REST APIs
 */

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.trim() === '' || password.trim() === '') {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const checkUser = await pool.query('SELECT id FROM game_users WHERE username = $1', [username.toLowerCase().trim()]);
    if (checkUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const newUser = await pool.query(
      'INSERT INTO game_users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username.trim(), hash]
    );

    const userId = newUser.rows[0].id;

    await pool.query('INSERT INTO game_user_stats (user_id) VALUES ($1)', [userId]);

    req.session.userId = userId;
    req.session.username = newUser.rows[0].username;

    res.json({ id: userId, username: req.session.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error registering user' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query('SELECT id, username, password_hash FROM game_users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error logging in' });
  }
});

app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ id: req.session.userId, username: req.session.username });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.username, s.games_played, s.wins
      FROM game_user_stats s
      JOIN game_users u ON s.user_id = u.id
      ORDER BY s.wins DESC, s.games_played ASC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching leaderboard' });
  }
});

const queue2 = [];
const queue6 = [];
const matchmakingTimers = new Map();

function broadcastQueueStatus(queue, capacity) {
  for (const player of queue) {
    player.socket.emit('matchmaking_status', {
      position: queue.length,
      needed: capacity
    });
  }
}

function removeFromQueues(userId) {
  const uIdStr = userId.toString();
  if (matchmakingTimers.has(uIdStr)) {
    clearTimeout(matchmakingTimers.get(uIdStr));
    matchmakingTimers.delete(uIdStr);
  }

  // Filter queue2
  const idx2 = queue2.findIndex(p => p.userId === uIdStr);
  if (idx2 > -1) {
    queue2.splice(idx2, 1);
    broadcastQueueStatus(queue2, 2);
  }

  // Filter queue6
  const idx6 = queue6.findIndex(p => p.userId === uIdStr);
  if (idx6 > -1) {
    queue6.splice(idx6, 1);
    broadcastQueueStatus(queue6, 6);
  }
}

function handleQueueDisconnect(socketId) {
  const idx2 = queue2.findIndex(p => p.socketId === socketId);
  if (idx2 > -1) {
    const entry = queue2[idx2];
    clearTimeout(matchmakingTimers.get(entry.userId));
    matchmakingTimers.delete(entry.userId);
    queue2.splice(idx2, 1);
    broadcastQueueStatus(queue2, 2);
    console.log(`User ${entry.username} disconnected from 2P queue.`);
  }

  const idx6 = queue6.findIndex(p => p.socketId === socketId);
  if (idx6 > -1) {
    const entry = queue6[idx6];
    clearTimeout(matchmakingTimers.get(entry.userId));
    matchmakingTimers.delete(entry.userId);
    queue6.splice(idx6, 1);
    broadcastQueueStatus(queue6, 6);
    console.log(`User ${entry.username} disconnected from 6P queue.`);
  }
}

function matchPlayers(queue, capacity) {
  const matched = queue.splice(0, capacity);
  
  // Clear timers for all matched players
  for (const player of matched) {
    if (matchmakingTimers.has(player.userId)) {
      clearTimeout(matchmakingTimers.get(player.userId));
      matchmakingTimers.delete(player.userId);
    }
  }

  const roomId = `Table_${Date.now()}`;
  const p1 = matched[0];
  
  const room = gameManager.createRoom(roomId, p1.userId, p1.username, capacity);
  p1.socket.join(roomId);
  const rp1 = room.players.find(p => p.id === p1.userId);
  if (rp1) rp1.socketId = p1.socketId;

  for (let i = 1; i < matched.length; i++) {
    const p = matched[i];
    gameManager.joinRoom(roomId, p.userId, p.username);
    p.socket.join(roomId);
    const rp = room.players.find(pl => pl.id === p.userId);
    if (rp) rp.socketId = p.socketId;
  }

  // Start game automatically
  gameManager.startGame(roomId);
  console.log(`Matchmaking completed: Room ${roomId} automatically started (${capacity} players)`);
  
  // Broadcast start state
  sendRoomStateToAll(room);
  sendRoomListUpdate();
}

function triggerQueueTimeout(userId, format) {
  const uIdStr = userId.toString();
  const q = format === '2players' ? queue2 : queue6;
  const capacity = format === '2players' ? 2 : 6;

  const idx = q.findIndex(p => p.userId === uIdStr);
  if (idx === -1) return; // Player was already matched

  // Pull player out
  const player = q[idx];
  q.splice(idx, 1);
  broadcastQueueStatus(q, capacity);

  // Clear timer
  matchmakingTimers.delete(uIdStr);

  const roomId = `Table_${Date.now()}_Auto`;
  const room = gameManager.createRoom(roomId, player.userId, player.username, capacity);
  player.socket.join(roomId);
  const rp = room.players.find(p => p.id === player.userId);
  if (rp) rp.socketId = player.socketId;

  // Start game (this automatically backfills empty seats with bots!)
  gameManager.startGame(roomId);
  console.log(`Matchmaking timeout triggered for ${player.username}. Room ${roomId} started with Bot backfill.`);

  sendRoomStateToAll(room);
  sendRoomListUpdate();
}

/**
 * Socket.io Websocket Controller
 */
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on('join_lobby', () => {
    socket.join('lobby');
    sendRoomListUpdate();
  });

  socket.on('join_matchmaking', ({ format, userId, username }) => {
    if (!format || !userId) return;
    const uId = userId.toString();

    if (format === '1vbot') {
      const roomId = `Practice_${socket.id}_${Date.now()}`;
      const room = gameManager.createRoom(roomId, uId, username, '1vbot');
      socket.join(roomId);
      const player = room.players.find(p => p.id === uId);
      if (player) player.socketId = socket.id;

      gameManager.startGame(roomId);
      console.log(`Practice table created for ${username}: ${roomId}`);
      sendRoomStateToAll(room);
      sendRoomListUpdate();
      return;
    }

    const q = format === '2players' ? queue2 : queue6;
    const capacity = format === '2players' ? 2 : 6;

    // Remove from other queues first
    removeFromQueues(uId);

    q.push({
      userId: uId,
      username,
      socketId: socket.id,
      socket
    });

    console.log(`User ${username} joined matchmaking for ${format}. Queue size: ${q.length}`);

    broadcastQueueStatus(q, capacity);

    if (q.length >= capacity) {
      matchPlayers(q, capacity);
    } else {
      const timeout = setTimeout(() => {
        triggerQueueTimeout(uId, format);
      }, 7000);
      matchmakingTimers.set(uId, timeout);
    }
  });

  socket.on('leave_matchmaking', ({ userId }) => {
    if (!userId) return;
    removeFromQueues(userId.toString());
    console.log(`User ${userId} left matchmaking.`);
  });

  socket.on('create_room', ({ roomId, userId, username, maxPlayers }) => {
    if (!roomId) return;
    const room = gameManager.createRoom(roomId, userId.toString(), username, maxPlayers);
    console.log(`Room created: ${roomId} by ${username} (Max: ${room.maxPlayers})`);
    
    socket.join(roomId);
    const player = room.players.find(p => p.id === userId.toString());
    if (player) player.socketId = socket.id;

    io.to(roomId).emit('room_state', getPublicRoomState(room, userId.toString()));
    sendRoomListUpdate();
  });

  socket.on('join_room', ({ roomId, userId, username }) => {
    if (!roomId) return;
    const room = gameManager.joinRoom(roomId, userId.toString(), username);
    
    if (room.error) {
      socket.emit('error_message', room.error);
      return;
    }

    socket.join(roomId);
    const player = room.players.find(p => p.id === userId.toString());
    if (player) player.socketId = socket.id;

    console.log(`User ${username} joined room ${roomId}`);
    io.to(roomId).emit('room_state', getPublicRoomState(room, userId.toString()));
    sendRoomListUpdate();
  });

  socket.on('start_game', ({ roomId }) => {
    const room = gameManager.rooms.get(roomId);
    if (!room) return;

    gameManager.startGame(roomId);
    console.log(`Game started in room: ${roomId}`);
    
    sendRoomStateToAll(room);
    sendRoomListUpdate();
  });

  socket.on('draw_card', ({ roomId, userId, source }) => {
    const room = gameManager.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) {
      socket.emit('error_message', "It is not your turn!");
      return;
    }

    const expectedHandLenBeforeDraw = activePlayer.revealedPureSet ? 9 : 13;
    if (activePlayer.hand.length !== expectedHandLenBeforeDraw) {
      socket.emit('error_message', "You have already drawn a card! Discard to end turn.");
      return;
    }

    let drawnCard = null;
    if (source === 'deck') {
      drawnCard = room.deck.pop();
    } else if (source === 'discard') {
      drawnCard = room.discardPile.pop();
    }

    if (!drawnCard) {
      socket.emit('error_message', "Deck/Discard pile is empty.");
      return;
    }

    activePlayer.hand.push(drawnCard);

    if (room.deck.length === 0) {
      gameManager.resetDrawDeck(room);
    }

    console.log(`Player ${activePlayer.username} drew ${drawnCard} from ${source}`);
    sendRoomStateToAll(room);
  });

  socket.on('discard_card', ({ roomId, userId, card }) => {
    const room = gameManager.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) {
      socket.emit('error_message', "It is not your turn!");
      return;
    }

    const expectedDiscardLen = activePlayer.revealedPureSet ? 10 : 14;
    if (activePlayer.hand.length !== expectedDiscardLen) {
      socket.emit('error_message', "You must draw a card before discarding!");
      return;
    }

    if (!activePlayer.hand.includes(card)) {
      socket.emit('error_message', "Card not in hand!");
      return;
    }

    activePlayer.hand = activePlayer.hand.filter(c => c !== card);
    room.discardPile.push(card);

    console.log(`Player ${activePlayer.username} discarded ${card}`);

    if (room.deck.length === 0) {
      gameManager.resetDrawDeck(room);
    }

    advanceTurn(room);
  });

  socket.on('reveal_pure_set', ({ roomId, userId, cards }) => {
    const room = gameManager.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) {
      socket.emit('error_message', "You can only reveal your Pure Set on your turn!");
      return;
    }

    const player = activePlayer;
    if (player.revealedPureSet) {
      socket.emit('error_message', "You have already revealed your pure set!");
      return;
    }

    if (player.hand.length !== 14) {
      socket.emit('error_message', "You must draw a card before revealing your Pure Set!");
      return;
    }

    const hasAllCards = cards.every(c => player.hand.includes(c));
    if (!hasAllCards) {
      socket.emit('error_message', "Selected cards are not all in hand.");
      return;
    }

    const isValid = gameManager.isValidPureSet(cards);
    if (!isValid) {
      socket.emit('error_message', "Invalid Pure Set! Must be 4 cards of the same rank, with one of each suit (no wildcards).");
      return;
    }

    player.revealedPureSet = cards;
    player.hand = player.hand.filter(c => !cards.includes(c));

    console.log(`Player ${player.username} revealed pure set: ${cards.join(', ')}`);

    let peekingStatus = false;
    if (!room.firstRevealer) {
      room.firstRevealer = uId;
      peekingStatus = true;
      console.log(`Player ${player.username} is the first to reveal and peeks at the joker.`);
    }

    const allPlayersRevealed = room.players.every(p => p.revealedPureSet !== null);
    if (allPlayersRevealed && !room.jokerDisclosed) {
      room.jokerDisclosed = true;
      console.log(`All players have revealed. Joker disclosed: ${room.hiddenJoker}`);
      io.to(roomId).emit('joker_disclosed', { joker: room.hiddenJoker });
    }

    sendRoomStateToAll(room);
    if (peekingStatus) {
      socket.emit('joker_peek', { joker: room.hiddenJoker });
    }
  });

  socket.on('disclose_joker', ({ roomId, userId }) => {
    const room = gameManager.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const uId = userId.toString();
    if (room.firstRevealer !== uId) {
      socket.emit('error_message', "Only the first player to reveal their pure set can disclose the joker!");
      return;
    }

    if (room.jokerDisclosed) return;

    room.jokerDisclosed = true;
    console.log(`Joker disclosed by player ${uId}: ${room.hiddenJoker}`);
    io.to(roomId).emit('joker_disclosed', { joker: room.hiddenJoker });
    sendRoomStateToAll(room);
  });

  socket.on('declare_win', async ({ roomId, userId, discardCard }) => {
    const room = gameManager.rooms.get(roomId);
    if (!room || room.status !== 'playing') return;

    const uId = userId.toString();
    const activePlayer = room.players[room.turnIndex];
    if (activePlayer.id !== uId) {
      socket.emit('error_message', "It is not your turn!");
      return;
    }

    if (!activePlayer.revealedPureSet) {
      socket.emit('error_message', "You must reveal a pure set before declaring a win!");
      return;
    }

    if (activePlayer.hand.length !== 10) {
      socket.emit('error_message', "You must draw a card first (have 10 cards in hand) to declare a win!");
      return;
    }

    if (!discardCard || !activePlayer.hand.includes(discardCard)) {
      socket.emit('error_message', "You must select exactly 1 card to discard/show to declare a win!");
      return;
    }

    // Temporarily remove discardCard to evaluate the remaining 9 cards
    const remainingCards = activePlayer.hand.filter(c => c !== discardCard);
    
    const jokerRank = gameManager.getCardRank(room.hiddenJoker);
    const win = gameManager.checkWinCondition(remainingCards, activePlayer.revealedPureSet, jokerRank, room.jokerDisclosed);

    if (win) {
      // Discard the card officially and end the game
      activePlayer.hand = remainingCards;
      room.discardPile.push(discardCard);

      room.status = 'finished';
      room.winnerId = uId;
      console.log(`Player ${activePlayer.username} declared win and WON!`);
      
      await gameManager.persistGameResult(room);

      io.to(roomId).emit('game_over', {
        winnerId: uId,
        winnerUsername: activePlayer.username,
        finalHands: room.players.map(p => ({
          id: p.id,
          username: p.username,
          hand: p.hand,
          revealedPureSet: p.revealedPureSet
        })),
        joker: room.hiddenJoker
      });
      sendRoomListUpdate();
    } else {
      socket.emit('error_message', "Invalid win declaration! Your remaining 9 cards must form three valid sets.");
    }
  });

  socket.on('disconnect', () => {
    handleQueueDisconnect(socket.id);
    console.log(`Socket disconnected: ${socket.id}`);
    for (const [roomId, room] of gameManager.rooms.entries()) {
      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.socketId = null;
        console.log(`Player ${player.username} disconnected from room ${roomId}`);
        
        const activeHumans = room.players.filter(p => !p.isAI && p.socketId !== null);
        if (activeHumans.length === 0 && room.status !== 'finished') {
          console.log(`No active humans in room ${roomId}. Deleting room.`);
          gameManager.rooms.delete(roomId);
        } else {
          io.to(roomId).emit('room_state', getPublicRoomState(room, null));
        }
        sendRoomListUpdate();
        break;
      }
    }
  });
});

function advanceTurn(room) {
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  room.turnCount++;
  
  sendRoomStateToAll(room);

  const nextPlayer = room.players[room.turnIndex];
  if (nextPlayer.isAI && room.status === 'playing') {
    setTimeout(() => {
      handleAITurn(room, nextPlayer);
    }, 1500);
  }
}

async function handleAITurn(room, aiPlayer) {
  if (room.status !== 'playing' || room.players[room.turnIndex].id !== aiPlayer.id) return;

  const result = gameManager.makeAIMove(room, aiPlayer);
  console.log(`AI Bot ${aiPlayer.username} moved:`, result);

  if (result.drewFromDiscard) {
    io.to(room.id).emit('game_log', `${aiPlayer.username} drew from the Discard pile.`);
  } else {
    io.to(room.id).emit('game_log', `${aiPlayer.username} drew from the Draw deck.`);
  }

  if (result.revealedNow) {
    io.to(room.id).emit('game_log', `${aiPlayer.username} revealed their Pure Set of four!`);
  }

  if (result.action === 'win') {
    room.status = 'finished';
    room.winnerId = aiPlayer.id;
    console.log(`AI Bot ${aiPlayer.username} has WON!`);

    await gameManager.persistGameResult(room);

    io.to(room.id).emit('game_over', {
      winnerId: aiPlayer.id,
      winnerUsername: aiPlayer.username,
      finalHands: room.players.map(p => ({
        id: p.id,
        username: p.username,
        hand: p.hand,
        revealedPureSet: p.revealedPureSet
      })),
      joker: room.hiddenJoker
    });
    sendRoomListUpdate();
  } else {
    io.to(room.id).emit('game_log', `${aiPlayer.username} discarded ${result.discardedCard}.`);
    
    if (room.jokerDisclosed && !room.alreadyNotifiedDisclosed) {
      room.alreadyNotifiedDisclosed = true;
      io.to(room.id).emit('joker_disclosed', { joker: room.hiddenJoker });
      io.to(room.id).emit('game_log', `${aiPlayer.username} disclosed the Hidden Joker! It is the ${room.hiddenJoker}.`);
    }

    const allPlayersRevealed = room.players.every(p => p.revealedPureSet !== null);
    if (allPlayersRevealed && !room.jokerDisclosed) {
      room.jokerDisclosed = true;
      room.alreadyNotifiedDisclosed = true;
      io.to(room.id).emit('joker_disclosed', { joker: room.hiddenJoker });
      io.to(room.id).emit('game_log', `All players have revealed. Joker disclosed: ${room.hiddenJoker}`);
    }

    advanceTurn(room);
  }
}

function getPublicRoomState(room, playerId) {
  return {
    id: room.id,
    status: room.status,
    jokerDisclosed: room.jokerDisclosed,
    hiddenJoker: room.jokerDisclosed ? room.hiddenJoker : null,
    firstRevealer: room.firstRevealer,
    turnIndex: room.turnIndex,
    turnCount: room.turnCount,
    winnerId: room.winnerId,
    deckCount: room.deck.length,
    discardPile: room.discardPile,
    topDiscard: room.discardPile[room.discardPile.length - 1] || null,
    maxPlayers: room.maxPlayers,
    players: room.players.map(p => {
      const isSelf = p.id === playerId;
      return {
        id: p.id,
        username: p.username,
        cardCount: p.hand.length,
        hand: isSelf ? p.hand : [],
        revealedPureSet: p.revealedPureSet,
        isAI: p.isAI,
        online: p.isAI || p.socketId !== null
      };
    })
  };
}

function sendRoomStateToAll(room) {
  for (const player of room.players) {
    if (!player.isAI && player.socketId) {
      io.to(player.socketId).emit('room_state', getPublicRoomState(room, player.id));
    }
  }
}

function sendRoomListUpdate() {
  const roomList = Array.from(gameManager.rooms.values()).map(r => ({
    id: r.id,
    status: r.status,
    playerCount: r.players.length,
    maxPlayers: r.maxPlayers
  }));
  io.to('lobby').emit('room_list', roomList);
}

// Serve index.html for SPA router fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

const PORT = process.env.PORT || 5173;
server.listen(PORT, () => {
  console.log(`Superset game server running on port ${PORT}`);
});

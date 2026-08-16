// backend/gameManager.js
const { pool } = require('./database');

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const rooms = new Map();

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getCardRank(card) {
  return card.slice(0, -1);
}

// Helper: Parse card suit
function getCardSuit(card) {
  return card.slice(-1);
}

// Helper: Check if a card is a joker
function isJoker(card, jokerRank) {
  return jokerRank && getCardRank(card) === jokerRank;
}

function isValidSet(cards, jokerRank) {
  if (cards.length !== 3 && cards.length !== 4) return false;

  const naturalCards = cards.filter(c => !isJoker(c, jokerRank));

  if (naturalCards.length === 0) return true;

  const targetRank = getCardRank(naturalCards[0]);
  const allSameRank = naturalCards.every(c => getCardRank(c) === targetRank);
  if (!allSameRank) return false;

  const suits = naturalCards.map(getCardSuit);
  const uniqueSuits = new Set(suits);
  if (suits.length !== uniqueSuits.size) return false;

  return true;
}

function isValidPureSet(cards) {
  if (cards.length !== 4) return false;
  const targetRank = getCardRank(cards[0]);
  const allSameRank = cards.every(c => getCardRank(c) === targetRank);
  if (!allSameRank) return false;

  const suits = cards.map(getCardSuit);
  const uniqueSuits = new Set(suits);
  return uniqueSuits.size === 4;
}

function findBestGroupings(hand, jokerRank, disclosed) {
  const jRank = disclosed ? jokerRank : null;
  const nJokers = hand.filter(c => isJoker(c, jRank));
  const naturals = hand.filter(c => !isJoker(c, jRank));

  const rankGroups = {};
  for (const card of naturals) {
    const r = getCardRank(card);
    if (!rankGroups[r]) rankGroups[r] = [];
    if (!rankGroups[r].some(c => getCardSuit(c) === getCardSuit(card))) {
      rankGroups[r].push(card);
    }
  }

  let pureSet = null;
  const remainingRanks = { ...rankGroups };
  for (const r in remainingRanks) {
    if (remainingRanks[r].length === 4) {
      pureSet = [...remainingRanks[r]];
      delete remainingRanks[r];
      break;
    }
  }

  const additionalSets = [];
  const unusedCards = [];
  const jokersAvailable = [...nJokers];

  const sortedRanks = Object.keys(remainingRanks).sort((a, b) => remainingRanks[b].length - remainingRanks[a].length);

  for (const r of sortedRanks) {
    const group = remainingRanks[r];
    if (group.length >= 3) {
      additionalSets.push(group);
    } else if (group.length === 2 && jokersAvailable.length >= 1) {
      additionalSets.push([...group, jokersAvailable.pop()]);
    } else if (group.length === 1 && jokersAvailable.length >= 2) {
      additionalSets.push([...group, jokersAvailable.pop(), jokersAvailable.pop()]);
    } else {
      unusedCards.push(...group);
    }
  }

  while (jokersAvailable.length >= 3) {
    additionalSets.push([jokersAvailable.pop(), jokersAvailable.pop(), jokersAvailable.pop()]);
  }
  unusedCards.push(...jokersAvailable);

  return {
    pureSet,
    additionalSets,
    unusedCards
  };
}

function checkWinCondition(hand, revealedPureSet, jokerRank, disclosed) {
  const jRank = disclosed ? jokerRank : null;

  if (revealedPureSet) {
    const remainingCards = [...hand];
    return canFormThreeSets(remainingCards, jRank);
  }

  if (hand.length !== 13) return false;

  const rankGroups = {};
  for (const card of hand) {
    const r = getCardRank(card);
    if (!rankGroups[r]) rankGroups[r] = [];
    rankGroups[r].push(card);
  }

  for (const r in rankGroups) {
    if (rankGroups[r].length >= 4) {
      const group = rankGroups[r];
      const combos = getCombinations(group, 4);
      for (const combo of combos) {
        if (isValidPureSet(combo)) {
          const remaining = hand.filter(c => !combo.includes(c));
          if (canFormThreeSets(remaining, jRank)) {
            return { pure: combo, others: remaining };
          }
        }
      }
    }
  }

  return false;
}

function canFormThreeSets(cards, jokerRank) {
  if (cards.length !== 9) return false;
  return backtrackSets(cards, [], jokerRank);
}

function backtrackSets(remaining, formedSets, jokerRank) {
  if (remaining.length === 0) {
    return formedSets.length === 3;
  }

  const c1 = remaining[0];

  for (let i = 1; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const c2 = remaining[i];
      const c3 = remaining[j];
      const group = [c1, c2, c3];

      if (isValidSet(group, jokerRank)) {
        const nextRemaining = remaining.filter((c, idx) => idx !== 0 && idx !== i && idx !== j);
        if (backtrackSets(nextRemaining, [...formedSets, group], jokerRank)) {
          return true;
        }
      }
    }
  }

  return false;
}

function getCombinations(array, k) {
  const result = [];
  function helper(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

function makeAIMove(room, aiPlayer) {
  const isFirstRevealer = room.firstRevealer === aiPlayer.id;
  const knowsJoker = room.jokerDisclosed || isFirstRevealer;
  const jokerRank = getCardRank(room.hiddenJoker);
  const jRank = knowsJoker ? jokerRank : null;

  const topDiscard = room.discardPile[room.discardPile.length - 1];
  let drewFromDiscard = false;

  if (topDiscard) {
    if (knowsJoker && isJoker(topDiscard, jokerRank)) {
      aiPlayer.hand.push(topDiscard);
      room.discardPile.pop();
      drewFromDiscard = true;
    } else {
      const testHand = [...aiPlayer.hand, topDiscard];
      const currentGroups = findBestGroupings(aiPlayer.hand, jokerRank, knowsJoker);
      const testGroups = findBestGroupings(testHand, jokerRank, knowsJoker);

      const currentSetsCount = (currentGroups.pureSet ? 1 : 0) + currentGroups.additionalSets.length;
      const testSetsCount = (testGroups.pureSet ? 1 : 0) + testGroups.additionalSets.length;

      if (testSetsCount > currentSetsCount || (testGroups.pureSet && !currentGroups.pureSet)) {
        aiPlayer.hand.push(topDiscard);
        room.discardPile.pop();
        drewFromDiscard = true;
      }
    }
  }

  if (!drewFromDiscard) {
    const drawn = room.deck.pop();
    aiPlayer.hand.push(drawn);
  }

  let revealedNow = false;
  if (!aiPlayer.revealedPureSet) {
    const groupings = findBestGroupings(aiPlayer.hand, jokerRank, knowsJoker);
    if (groupings.pureSet) {
      aiPlayer.revealedPureSet = groupings.pureSet;
      aiPlayer.hand = aiPlayer.hand.filter(c => !groupings.pureSet.includes(c));
      revealedNow = true;
      
      if (!room.firstRevealer) {
        room.firstRevealer = aiPlayer.id;
      }
    }
  }

  if (room.firstRevealer === aiPlayer.id && !room.jokerDisclosed) {
    if (!aiPlayer.turnsSinceReveal) aiPlayer.turnsSinceReveal = 0;
    aiPlayer.turnsSinceReveal++;
    
    const groupings = findBestGroupings(aiPlayer.hand, jokerRank, true);
    if (groupings.additionalSets.length >= 2 || aiPlayer.turnsSinceReveal >= 3) {
      room.jokerDisclosed = true;
    }
  }

  let winningDiscard = null;
  let winningPureSet = null;

  if (!aiPlayer.revealedPureSet) {
    // Hand has 14 cards. Check if discarding 1 card wins
    for (const card of aiPlayer.hand) {
      const remaining = aiPlayer.hand.filter(c => c !== card);
      const win = checkWinCondition(remaining, null, jokerRank, room.jokerDisclosed);
      if (win) {
        winningDiscard = card;
        winningPureSet = win.pure;
        break;
      }
    }
  } else {
    // Hand has 10 cards. Check if discarding 1 card wins
    for (const card of aiPlayer.hand) {
      const remaining = aiPlayer.hand.filter(c => c !== card);
      const win = checkWinCondition(remaining, aiPlayer.revealedPureSet, jokerRank, room.jokerDisclosed);
      if (win) {
        winningDiscard = card;
        break;
      }
    }
  }

  if (winningDiscard) {
    if (winningPureSet) {
      aiPlayer.revealedPureSet = winningPureSet;
      aiPlayer.hand = aiPlayer.hand.filter(c => !winningPureSet.includes(c));
      revealedNow = true;
      if (!room.firstRevealer) {
        room.firstRevealer = aiPlayer.id;
      }
    }
    aiPlayer.hand = aiPlayer.hand.filter(c => c !== winningDiscard);
    room.discardPile.push(winningDiscard);
    return {
      action: 'win',
      drewFromDiscard,
      revealedNow
    };
  }

  const groupings = findBestGroupings(aiPlayer.hand, jokerRank, knowsJoker);
  let discardCard = null;

  if (groupings.unusedCards.length > 0) {
    const nonJokerUnused = groupings.unusedCards.filter(c => !isJoker(c, jRank));
    if (nonJokerUnused.length > 0) {
      discardCard = nonJokerUnused[0];
    } else {
      discardCard = groupings.unusedCards[0];
    }
  } else {
    const sets = groupings.additionalSets;
    if (sets.length > 0) {
      const sortedSets = [...sets].sort((a, b) => b.length - a.length);
      discardCard = sortedSets[0][sortedSets[0].length - 1];
    } else {
      discardCard = aiPlayer.hand[0];
    }
  }

  aiPlayer.hand = aiPlayer.hand.filter(c => c !== discardCard);
  room.discardPile.push(discardCard);

  if (room.deck.length === 0) {
    resetDrawDeck(room);
  }

  return {
    action: 'discard',
    discardedCard: discardCard,
    drewFromDiscard,
    revealedNow
  };
}

function resetDrawDeck(room) {
  if (room.discardPile.length <= 1) return;
  const topDiscard = room.discardPile.pop();
  room.deck = shuffle([...room.discardPile]);
  room.discardPile = [topDiscard];
  console.log(`Room ${room.id}: Draw pile replenished from discard pile.`);
}

function createRoom(roomId, creatorId, creatorUsername, maxPlayers = 3) {
  const isVsBot = maxPlayers === '1vbot';
  const parsedMax = isVsBot ? 2 : Math.max(2, Math.min(6, parseInt(maxPlayers) || 3));
  const room = {
    id: roomId,
    status: 'waiting',
    maxPlayers: parsedMax,
    players: [
      {
        id: creatorId,
        username: creatorUsername,
        hand: [],
        revealedPureSet: null,
        isAI: false,
        socketId: null
      }
    ],
    deck: [],
    discardPile: [],
    hiddenJoker: null,
    jokerDisclosed: false,
    firstRevealer: null,
    turnIndex: 0,
    turnCount: 0,
    winnerId: null
  };

  if (isVsBot) {
    room.players.push({
      id: 'AI_2',
      username: 'Bot 1',
      hand: [],
      revealedPureSet: null,
      isAI: true,
      socketId: null
    });
  }

  rooms.set(roomId, room);
  return room;
}

function joinRoom(roomId, playerId, playerUsername) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };
  if (room.status !== 'waiting') return { error: 'Game already started' };
  if (room.players.length >= room.maxPlayers) return { error: 'Room is full' };
  if (room.players.some(p => p.id === playerId)) return room;

  room.players.push({
    id: playerId,
    username: playerUsername,
    hand: [],
    revealedPureSet: null,
    isAI: false,
    socketId: null
  });

  return room;
}

function startGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return { error: 'Room not found' };

  const startingPlayerCount = room.players.length;
  for (let i = startingPlayerCount + 1; i <= room.maxPlayers; i++) {
    room.players.push({
      id: `AI_${i}`,
      username: `Bot ${i - 1}`,
      hand: [],
      revealedPureSet: null,
      isAI: true,
      socketId: null
    });
  }

  const numDecks = room.maxPlayers >= 4 ? 2 : 1;
  let deck = [];
  for (let d = 0; d < numDecks; d++) {
    deck.push(...createDeck());
  }
  deck = shuffle(deck);

  for (const player of room.players) {
    player.hand = [];
    for (let j = 0; j < 13; j++) {
      player.hand.push(deck.pop());
    }
  }

  const jokerIndex = Math.floor(Math.random() * deck.length);
  room.hiddenJoker = deck.splice(jokerIndex, 1)[0];

  room.discardPile = [deck.pop()];
  room.deck = deck;
  room.jokerDisclosed = false;
  room.firstRevealer = null;
  room.status = 'playing';
  room.turnIndex = 0;
  room.turnCount = 0;
  room.winnerId = null;

  return room;
}

async function persistGameResult(room) {
  try {
    const winner = room.players.find(p => p.id === room.winnerId);
    const winnerDbId = (winner && !winner.isAI) ? parseInt(winner.id) : null;

    const res = await pool.query(
      'INSERT INTO game_history (winner_id) VALUES ($1) RETURNING id',
      [winnerDbId]
    );

    for (const player of room.players) {
      if (!player.isAI) {
        const userId = parseInt(player.id);
        const isWinner = player.id === room.winnerId;
        
        await pool.query(`
          INSERT INTO game_user_stats (user_id, games_played, wins)
          VALUES ($1, 1, $2)
          ON CONFLICT (user_id) DO UPDATE SET
            games_played = game_user_stats.games_played + 1,
            wins = game_user_stats.wins + $2
        `, [userId, isWinner ? 1 : 0]);
      }
    }
    console.log(`Room ${room.id} result persisted. Winner DB ID: ${winnerDbId}`);
  } catch (err) {
    console.error('Error persisting game result:', err);
  }
}

module.exports = {
  rooms,
  createRoom,
  joinRoom,
  startGame,
  makeAIMove,
  resetDrawDeck,
  isValidSet,
  isValidPureSet,
  findBestGroupings,
  checkWinCondition,
  persistGameResult,
  getCardRank,
  getCardSuit
};

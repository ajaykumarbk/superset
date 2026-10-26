import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';

const SUIT_SYMBOLS = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function reconcileGroups(oldGroups, newHand) {
  if (!oldGroups || oldGroups.length === 0) {
    return [newHand];
  }
  
  // 1. Filter out cards that are no longer in newHand
  const updatedGroups = oldGroups.map(group =>
    group.filter(card => newHand.includes(card))
  ).filter(group => group.length > 0);

  // 2. Find any cards in newHand that are not in any of the updatedGroups
  const groupCards = new Set(updatedGroups.flat());
  const missingCards = newHand.filter(card => !groupCards.has(card));

  // 3. Add missing cards to the first group
  if (missingCards.length > 0) {
    if (updatedGroups.length > 0) {
      updatedGroups[0] = [...updatedGroups[0], ...missingCards];
    } else {
      updatedGroups.push(missingCards);
    }
  }

  return updatedGroups;
}

export default function GameBoard({ currentUser, socket, roomState, logs, secretJoker, onLeaveRoom, onRulesClick, showFloatingError }) {
  const [selectedCards, setSelectedCards] = useState([]);
  const [handGroups, setHandGroups] = useState([]);
  const prevHandRef     = useRef([]);
  // Server-confirmed draw tracker (prevents multiple draws per turn)
  const drawnThisTurn   = useRef(false);
  // Debounce guard (prevents rapid double-clicks)
  const actionInFlight  = useRef(false);

  const self = roomState?.players?.find(p => p.id === currentUser.id.toString());
  const actualHand = self ? self.hand : [];

  // Update hand groups when actual hand changes, and handle auto-select of drawn card
  useEffect(() => {
    if (actualHand) {
      const prev = prevHandRef.current;
      // Hand grew by 1 → server confirmed draw
      if ((actualHand.length === 14 && prev.length === 13) ||
          (actualHand.length === 10 && prev.length === 9)) {
        const newCard = actualHand.find(c => !prev.includes(c));
        if (newCard) setSelectedCards([newCard]);
        drawnThisTurn.current = true;
      }
      // Hand shrank → server confirmed discard, reset draw flag
      if ((actualHand.length === 13 && prev.length === 14) ||
          (actualHand.length === 9  && prev.length === 10)) {
        drawnThisTurn.current = false;
      }
      setHandGroups(g => reconcileGroups(g, actualHand));
      prevHandRef.current = actualHand;
    }
  }, [actualHand]);

  if (!roomState) return null;

  const isMyTurn = () => {
    const activePlayer = roomState.players[roomState.turnIndex];
    return activePlayer?.id === currentUser.id.toString();
  };

  const hasDrawnCard = () => {
    const totalCards = handGroups.flat().length;
    return totalCards === 14 || totalCards === 10;
  };

  const handleDraw = (source) => {
    if (!isMyTurn())          { showFloatingError("It is not your turn!"); return; }
    if (drawnThisTurn.current){ showFloatingError("You have already drawn a card! Discard to end your turn."); return; }
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setTimeout(() => { actionInFlight.current = false; }, 800);
    socket.emit('draw_card', { roomId: roomState.id, userId: currentUser.id, source });
  };

  const handleDiscardClick = () => {
    if (!isMyTurn())              { showFloatingError("It is not your turn!"); return; }
    if (!drawnThisTurn.current)   { showFloatingError("You must draw a card before discarding!"); return; }
    if (selectedCards.length !== 1){ showFloatingError("Select exactly 1 card from your hand to discard."); return; }
    if (actionInFlight.current)   return;
    actionInFlight.current = true;
    setTimeout(() => { actionInFlight.current = false; }, 800);
    socket.emit('discard_card', { roomId: roomState.id, userId: currentUser.id, card: selectedCards[0] });
    setSelectedCards([]);
  };

  const handleToggleCard = (card) => {
    setSelectedCards(prev => {
      const idx = prev.indexOf(card);
      if (idx > -1) {
        const copy = [...prev];
        copy.splice(idx, 1);
        return copy;
      } else {
        return [...prev, card];
      }
    });
  };

  // Sort Hand Helpers
  const handleSortRank = () => {
    const sorted = [...actualHand].sort((a, b) => {
      const rankA = RANKS.indexOf(a.slice(0, -1));
      const rankB = RANKS.indexOf(b.slice(0, -1));
      return rankA - rankB;
    });
    setHandGroups([sorted]);
  };

  const handleSortSuit = () => {
    const sorted = [...actualHand].sort((a, b) => {
      const suitA = a.slice(-1);
      const suitB = b.slice(-1);
      if (suitA !== suitB) return suitA.localeCompare(suitB);
      return RANKS.indexOf(a.slice(0, -1)) - RANKS.indexOf(b.slice(0, -1));
    });
    setHandGroups([sorted]);
  };

  // Group Hand Helpers
  const handleGroupSelected = () => {
    if (selectedCards.length === 0) {
      showFloatingError("Select one or more cards in your hand first to group them!");
      return;
    }

    // Remove selected cards from all existing groups
    const newGroups = handGroups.map(group =>
      group.filter(card => !selectedCards.includes(card))
    ).filter(group => group.length > 0);

    // Add selected cards as a new group
    newGroups.push([...selectedCards]);

    setHandGroups(newGroups);
    setSelectedCards([]);
  };

  const handleClearGroups = () => {
    setHandGroups([actualHand]);
    setSelectedCards([]);
  };

  // Action emitters
  const handleRevealPure = () => {
    if (selectedCards.length !== 4) {
      showFloatingError("You must select exactly 4 cards to reveal a Pure Set.");
      return;
    }
    socket.emit('reveal_pure_set', { roomId: roomState.id, userId: currentUser.id, cards: selectedCards });
    setSelectedCards([]);
  };

  const handleDiscloseJoker = () => {
    socket.emit('disclose_joker', { roomId: roomState.id, userId: currentUser.id });
  };

  const handleDeclareWin = () => {
    if (selectedCards.length !== 1) {
      showFloatingError("Select exactly 1 card in your hand that you want to discard/show to declare the win.");
      return;
    }
    socket.emit('declare_win', { roomId: roomState.id, userId: currentUser.id, discardCard: selectedCards[0] });
    setSelectedCards([]);
  };

  // Opponents row elements mapping
  const opponents = roomState.players.filter(p => p.id !== currentUser.id.toString());
  const activePlayer = roomState.players[roomState.turnIndex];
  const isSelfTurn = activePlayer?.id === currentUser.id.toString();

  // Joker variables
  const jokerRank = secretJoker ? secretJoker.slice(0, -1) : null;
  const isJokerDisclosed = roomState.jokerDisclosed;

  return (
    <div id="game-screen" className="view-panel active">
      {/* Header bar */}
      <div className="game-header glass-panel">
        <button onClick={onLeaveRoom} id="leave-room-btn" className="game-back-btn">
          <i className="fa-solid fa-chevron-left"></i> Lobby
        </button>
        <div className="game-room-info">
          <h2>Room: <span id="game-room-id-val">{roomState.id}</span></h2>
          <div className="phase-badge" id="game-phase-badge">
            {roomState.jokerDisclosed
              ? 'Phase 3: The Meltdown'
              : roomState.firstRevealer
              ? 'Phase 2: Secret Joker Active'
              : 'Phase 1: Pure Set Race'}
          </div>
        </div>
        <button onClick={onRulesClick} className="icon-btn"><i className="fa-solid fa-circle-question"></i></button>
      </div>

      {/* Card Table Felt */}
      <div className="card-table">
        {roomState.status === 'waiting' ? (
          <div id="game-waiting-overlay" className="game-waiting-overlay glass-panel">
            <h3>Waiting for Players...</h3>
            <p id="waiting-players-count">{roomState.players.length}/{roomState.maxPlayers} Players in Room</p>
            <div className="waiting-list">
              {roomState.players.map(p => (
                <div key={p.id} className="waiting-player">
                  <i className="fa-solid fa-circle-check"></i> {p.username} {p.id === currentUser.id.toString() ? '(You)' : ''}
                </div>
              ))}
            </div>
            {roomState.players[0]?.id === currentUser.id.toString() && (
              <button
                onClick={() => socket.emit('start_game', { roomId: roomState.id })}
                className="glow-btn btn-gold"
              >
                Start Match (With Bots)
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Dynamic Opponent Seats Row */}
            <div className="opponents-seats-row">
              {opponents.map(op => {
                const isOpTurn = activePlayer?.id === op.id;
                return (
                  <div key={op.id} className={`seat glass-panel ${isOpTurn ? 'pulse-border' : ''}`}>
                    <div className="seat-avatar">
                      {op.isAI ? <i className="fa-solid fa-robot"></i> : <i className="fa-solid fa-user-ninja"></i>}
                    </div>
                    <div className="seat-info">
                      <h4 className="player-name">{op.username}</h4>
                      <p className="player-status">
                        {op.online ? (op.revealedPureSet ? 'Pure Revealed!' : 'Playing...') : 'Offline'}
                      </p>
                      <div className="card-count-badge">
                        <i className="fa-solid fa-clone"></i>
                        <span>{op.cardCount}</span>
                      </div>
                    </div>
                    <div className="revealed-pure-slot">
                      <h5>Revealed Pure Set</h5>
                      <div className="revealed-cards-row">
                        {op.revealedPureSet && op.revealedPureSet.map((c, i) => (
                          <Card key={i} cardCode={c} isSelected={false} isWildcard={false} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Decks Area */}
            <div className="table-center">
              {/* Draw Pile */}
              <div className="deck-container">
                <div className="deck-title">Draw Deck</div>
                <div onClick={() => handleDraw('deck')} className="card card-back">
                  <div className="deck-count">{roomState.deckCount}</div>
                </div>
              </div>

              {/* Discard Pile */}
              <div className="deck-container">
                <div className="deck-title">Discard</div>
                <div
                  onClick={() => {
                    if (!isMyTurn()) { showFloatingError("It is not your turn!"); return; }
                    if (drawnThisTurn.current) {
                      handleDiscardClick();
                    } else {
                      handleDraw('discard');
                    }
                  }}
                  className="discard-pile-slot"
                  style={{ cursor: 'pointer' }}
                  title={isMyTurn() && drawnThisTurn.current ? 'Click to discard your selected card here' : 'Click to draw this card'}
                >
                  {roomState.topDiscard && (
                    <Card cardCode={roomState.topDiscard} isSelected={false} isWildcard={false} />
                  )}
                </div>
              </div>

              {/* Hidden Joker */}
              <div className="deck-container">
                <div className="deck-title">Hidden Joker</div>
                {roomState.jokerDisclosed && roomState.hiddenJoker ? (
                  <Card cardCode={roomState.hiddenJoker} isSelected={false} isWildcard={true} />
                ) : (
                  <div className="card card-back joker-glow">
                    <div className="joker-question">?</div>
                  </div>
                )}
                {secretJoker && !roomState.jokerDisclosed && (
                  <div className="secret-joker-badge">
                    Peek:{' '}
                    <span className={secretJoker.slice(-1) === 'H' || secretJoker.slice(-1) === 'D' ? 'card-red' : 'card-black'}>
                      {secretJoker.slice(0, -1)}
                      {SUIT_SYMBOLS[secretJoker.slice(-1)]}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Log Feed */}
      {roomState.status === 'playing' && (
        <div className="game-log-ticker glass-panel">
          <div className="log-header">
            <span><i className="fa-solid fa-clipboard-list"></i> Live Play Log</span>
          </div>
          <div className="log-messages">
            {logs.map((log, i) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}

      {/* HUD (Bottom) */}
      {roomState.status === 'playing' && self && (
        <div className="player-dashboard glass-panel">
          <div className="player-dashboard-header">
            <div className="player-info-hud">
              <span className={`user-status-light ${isSelfTurn ? 'active-turn' : ''}`}></span>
              <span className="hud-username">{currentUser.username}</span>
              <span className="hud-turn-message">
                {isSelfTurn
                  ? hasDrawnCard()
                    ? 'Your turn! Select a card and click Discard pile to discard.'
                    : 'Your turn! Draw from Deck or Discard pile.'
                  : `Waiting for ${activePlayer?.username || 'other'}'s turn...`}
              </span>
            </div>

            {/* Hand Action Controls */}
            <div className="player-action-controls">
              <button onClick={handleSortRank} className="action-btn">
                <i className="fa-solid fa-sort-numeric-down"></i> Sort Rank
              </button>
              <button onClick={handleSortSuit} className="action-btn">
                <i className="fa-solid fa-palette"></i> Sort Suit
              </button>
              <button
                onClick={handleGroupSelected}
                className="action-btn btn-cyan-outline"
                disabled={selectedCards.length === 0}
              >
                <i className="fa-solid fa-object-group"></i> Group Selected
              </button>
              <button
                onClick={handleClearGroups}
                className="action-btn"
              >
                <i className="fa-solid fa-rotate-left"></i> Reset Groups
              </button>
              <button
                onClick={handleDiscardClick}
                className="action-btn btn-rose-outline"
                disabled={!isSelfTurn || !drawnThisTurn.current || selectedCards.length !== 1}
              >
                <i className="fa-solid fa-trash-can"></i> Discard Card
              </button>
              <button
                onClick={handleRevealPure}
                className="action-btn btn-gold-outline"
                disabled={self.revealedPureSet !== null || selectedCards.length !== 4 || !isSelfTurn || !drawnThisTurn.current}
              >
                <i className="fa-solid fa-star"></i> Reveal Pure Set
              </button>
              {roomState.firstRevealer === currentUser.id.toString() && !roomState.jokerDisclosed && (
                <button onClick={handleDiscloseJoker} className="action-btn btn-cyan-outline">
                  <i className="fa-solid fa-eye"></i> Disclose Joker
                </button>
              )}
              <button
                onClick={handleDeclareWin}
                className="action-btn btn-emerald-outline"
                disabled={!self.revealedPureSet || !isSelfTurn || handGroups.flat().length !== 10 || selectedCards.length !== 1 || !drawnThisTurn.current}
              >
                <i className="fa-solid fa-crown"></i> Declare Win
              </button>
            </div>
          </div>

          {/* User's cards */}
          <div className="player-hand-container">
            {self.revealedPureSet && (
              <div className="user-revealed-pure-container">
                <div className="container-title">My Revealed Pure Set</div>
                <div className="revealed-cards-row">
                  {self.revealedPureSet.map((c, i) => (
                    <Card key={i} cardCode={c} isSelected={false} isWildcard={false} />
                  ))}
                </div>
              </div>
            )}

            <div className="player-hand-wrapper">
              <div className="container-title">My Hand ({handGroups.flat().length} cards)</div>
              <div className="hand-groups-wrapper">
                {handGroups.map((group, groupIdx) => (
                  <div key={groupIdx} className="hand-group glass-panel">
                    <div className="group-header">Group {groupIdx + 1}</div>
                    <div className="group-cards-row">
                      {group.map((c, i) => {
                        const r = c.slice(0, -1);
                        const isWild = jokerRank && r === jokerRank;
                        const isSel = selectedCards.includes(c);
                        return (
                          <Card
                            key={i}
                            cardCode={c}
                            isSelected={isSel}
                            isWildcard={isWild}
                            onClick={() => handleToggleCard(c)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// frontend/src/components/Game/GameBoard.tsx
import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import type { Socket } from 'socket.io-client';
import type { RoomState, CurrentUser, PlayerState } from '../../types';
import { SUIT_SYMBOLS, getRank } from '../../utils/cardUtils';

const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

function reconcileGroups(oldGroups: string[][], newHand: string[]): string[][] {
  if (!oldGroups || oldGroups.length === 0) return [newHand];
  const updated = oldGroups.map(g => g.filter(c => newHand.includes(c))).filter(g => g.length > 0);
  const groupSet = new Set(updated.flat());
  const missing  = newHand.filter(c => !groupSet.has(c));
  if (missing.length > 0) updated.length > 0 ? (updated[0] = [...updated[0], ...missing]) : updated.push(missing);
  return updated;
}

interface GameBoardProps {
  currentUser: CurrentUser;
  socket: Socket;
  roomState: RoomState;
  logs: string[];
  secretJoker: string | null;
  onLeaveRoom: () => void;
  onRulesClick: () => void;
  showFloatingError: (msg: string) => void;
}

export default function GameBoard({
  currentUser, socket, roomState, logs, secretJoker, onLeaveRoom, onRulesClick, showFloatingError,
}: GameBoardProps) {
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [handGroups,    setHandGroups]    = useState<string[][]>([]);
  const prevHandRef      = useRef<string[]>([]);
  // Tracks whether we have drawn this turn (server-confirmed via hand size change)
  const drawnThisTurn    = useRef<boolean>(false);
  // Prevents double-click / rapid-fire actions
  const actionInFlight   = useRef<boolean>(false);

  const self       = roomState?.players?.find(p => p.id === currentUser.id.toString());
  const actualHand = self ? self.hand : [];

  useEffect(() => {
    if (actualHand) {
      const prev = prevHandRef.current;
      // Hand grew by 1 → draw was confirmed by server
      if ((actualHand.length === 14 && prev.length === 13) ||
          (actualHand.length === 10 && prev.length === 9)) {
        const newCard = actualHand.find(c => !prev.includes(c));
        if (newCard) setSelectedCards([newCard]);
        drawnThisTurn.current = true;
      }
      // Hand shrank back → discard was confirmed; reset draw flag
      if ((actualHand.length === 13 && prev.length === 14) ||
          (actualHand.length === 9  && prev.length === 10)) {
        drawnThisTurn.current = false;
      }
      setHandGroups(g => reconcileGroups(g, actualHand));
      prevHandRef.current = actualHand;
    }
  }, [actualHand]);

  if (!roomState) return null;

  const isMyTurn    = () => roomState.players[roomState.turnIndex]?.id === currentUser.id.toString();
  const hasDrawnCard = () => { const t = handGroups.flat().length; return t === 14 || t === 10; };

  const handleDraw = (source: 'deck' | 'discard') => {
    if (!isMyTurn())         { showFloatingError('It is not your turn!'); return; }
    if (drawnThisTurn.current) { showFloatingError('You have already drawn a card! Discard to end your turn.'); return; }
    if (actionInFlight.current) return; // debounce rapid clicks
    actionInFlight.current = true;
    setTimeout(() => { actionInFlight.current = false; }, 800);
    socket.emit('draw_card', { roomId: roomState.id, userId: currentUser.id, source });
  };

  const handleDiscardClick = () => {
    if (!isMyTurn())             { showFloatingError('It is not your turn!'); return; }
    if (!drawnThisTurn.current)  { showFloatingError('You must draw a card before discarding!'); return; }
    if (selectedCards.length !== 1) { showFloatingError('Select exactly 1 card from your hand to discard.'); return; }
    if (actionInFlight.current)  return; // debounce rapid clicks
    actionInFlight.current = true;
    setTimeout(() => { actionInFlight.current = false; }, 800);
    socket.emit('discard_card', { roomId: roomState.id, userId: currentUser.id, card: selectedCards[0] });
    setSelectedCards([]);
  };

  const handleToggleCard = (card: string) => {
    setSelectedCards(prev => prev.includes(card) ? prev.filter(c => c !== card) : [...prev, card]);
  };

  const handleSortRank = () => setHandGroups([[...actualHand].sort((a, b) => RANKS.indexOf(getRank(a)) - RANKS.indexOf(getRank(b)))]);
  const handleSortSuit = () => setHandGroups([[...actualHand].sort((a, b) => {
    const sa = a.slice(-1), sb = b.slice(-1);
    if (sa !== sb) return sa.localeCompare(sb);
    return RANKS.indexOf(getRank(a)) - RANKS.indexOf(getRank(b));
  })]);

  const handleGroupSelected = () => {
    if (selectedCards.length === 0) { showFloatingError('Select one or more cards to group them!'); return; }
    const newGroups = handGroups.map(g => g.filter(c => !selectedCards.includes(c))).filter(g => g.length > 0);
    newGroups.push([...selectedCards]);
    setHandGroups(newGroups);
    setSelectedCards([]);
  };

  const handleClearGroups = () => { setHandGroups([actualHand]); setSelectedCards([]); };

  const handleRevealPure = () => {
    if (selectedCards.length !== 4) { showFloatingError('You must select exactly 4 cards to reveal a Pure Set.'); return; }
    socket.emit('reveal_pure_set', { roomId: roomState.id, userId: currentUser.id, cards: selectedCards });
    setSelectedCards([]);
  };

  const handleDiscloseJoker  = () => socket.emit('disclose_joker', { roomId: roomState.id, userId: currentUser.id });
  const handleDeclareWin     = () => {
    if (selectedCards.length !== 1) { showFloatingError('Select exactly 1 card to discard/show to declare the win.'); return; }
    socket.emit('declare_win', { roomId: roomState.id, userId: currentUser.id, discardCard: selectedCards[0] });
    setSelectedCards([]);
  };

  const opponents    = roomState.players.filter(p => p.id !== currentUser.id.toString());
  const activePlayer = roomState.players[roomState.turnIndex];
  const isSelfTurn   = activePlayer?.id === currentUser.id.toString();
  const jokerRank    = secretJoker ? getRank(secretJoker) : null;

  return (
    <div id="game-screen" className="view-panel active">
      {/* Header */}
      <div className="game-header glass-panel">
        <button onClick={onLeaveRoom} id="leave-room-btn" className="game-back-btn">
          <i className="fa-solid fa-chevron-left" /> Lobby
        </button>
        <div className="game-room-info">
          <h2>Room: <span id="game-room-id-val">{roomState.id}</span></h2>
          <div className="phase-badge" id="game-phase-badge">
            {roomState.jokerDisclosed ? 'Phase 3: The Meltdown'
              : roomState.firstRevealer ? 'Phase 2: Secret Joker Active'
              : 'Phase 1: Pure Set Race'}
          </div>
        </div>
        <button onClick={onRulesClick} className="icon-btn"><i className="fa-solid fa-circle-question" /></button>
      </div>

      {/* Card Table */}
      <div className="card-table">
        {roomState.status === 'waiting' ? (
          <div id="game-waiting-overlay" className="game-waiting-overlay glass-panel">
            <h3>Waiting for Players...</h3>
            <p id="waiting-players-count">{roomState.players.length}/{roomState.maxPlayers} Players in Room</p>
            <div className="waiting-list">
              {roomState.players.map(p => (
                <div key={p.id} className="waiting-player">
                  <i className="fa-solid fa-circle-check" /> {p.username} {p.id === currentUser.id.toString() ? '(You)' : ''}
                </div>
              ))}
            </div>
            {roomState.players[0]?.id === currentUser.id.toString() && (
              <button onClick={() => socket.emit('start_game', { roomId: roomState.id })} className="glow-btn btn-gold">
                Start Match (With Bots)
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Opponents */}
            <div className="opponents-seats-row">
              {opponents.map(op => {
                const isOpTurn = activePlayer?.id === op.id;
                return (
                  <div key={op.id} className={`seat glass-panel ${isOpTurn ? 'pulse-border' : ''}`}>
                    <div className="seat-avatar">
                      {op.isAI ? <i className="fa-solid fa-robot" /> : <i className="fa-solid fa-user-ninja" />}
                    </div>
                    <div className="seat-info">
                      <h4 className="player-name">{op.username}</h4>
                      <p className="player-status">{op.online ? (op.revealedPureSet ? 'Pure Revealed!' : 'Playing...') : 'Offline'}</p>
                      <div className="card-count-badge"><i className="fa-solid fa-clone" /><span>{op.cardCount}</span></div>
                    </div>
                    <div className="revealed-pure-slot">
                      <h5>Revealed Pure Set</h5>
                      <div className="revealed-cards-row">
                        {op.revealedPureSet?.map((c, i) => <Card key={i} cardCode={c} isSelected={false} isWildcard={false} />)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Decks */}
            <div className="table-center">
              <div className="deck-container">
                <div className="deck-title">Draw Deck</div>
                <div onClick={() => handleDraw('deck')} className="card card-back">
                  <div className="deck-count">{roomState.deckCount}</div>
                </div>
              </div>
              <div className="deck-container">
                <div className="deck-title">Discard</div>
                {/* Separate click intent: draw from discard OR discard your selected card */}
                <div
                  onClick={() => {
                    if (!isMyTurn()) { showFloatingError('It is not your turn!'); return; }
                    if (drawnThisTurn.current) {
                      // Already drew — this click means: discard selected card to pile
                      handleDiscardClick();
                    } else {
                      // Haven't drawn yet — pick up from discard pile
                      handleDraw('discard');
                    }
                  }}
                  className="discard-pile-slot"
                  style={{ cursor: 'pointer' }}
                  title={isMyTurn() && drawnThisTurn.current ? 'Click to discard your selected card here' : 'Click to draw this card'}
                >
                  {roomState.topDiscard && <Card cardCode={roomState.topDiscard} isSelected={false} isWildcard={false} />}
                </div>
              </div>
              <div className="deck-container">
                <div className="deck-title">Hidden Joker</div>
                {roomState.jokerDisclosed && roomState.hiddenJoker
                  ? <Card cardCode={roomState.hiddenJoker} isSelected={false} isWildcard={true} />
                  : <div className="card card-back joker-glow"><div className="joker-question">?</div></div>}
                {secretJoker && !roomState.jokerDisclosed && (
                  <div className="secret-joker-badge">
                    Peek:{' '}
                    <span className={secretJoker.slice(-1) === 'H' || secretJoker.slice(-1) === 'D' ? 'card-red' : 'card-black'}>
                      {secretJoker.slice(0, -1)}{SUIT_SYMBOLS[secretJoker.slice(-1) as keyof typeof SUIT_SYMBOLS]}
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
          <div className="log-header"><span><i className="fa-solid fa-clipboard-list" /> Live Play Log</span></div>
          <div className="log-messages">{logs.map((log, i) => <div key={i}>{log}</div>)}</div>
        </div>
      )}

      {/* HUD */}
      {roomState.status === 'playing' && self && (
        <div className="player-dashboard glass-panel">
          <div className="player-dashboard-header">
            <div className="player-info-hud">
              <span className={`user-status-light ${isSelfTurn ? 'active-turn' : ''}`} />
              <span className="hud-username">{currentUser.username}</span>
              <span className="hud-turn-message">
                {isSelfTurn
                  ? hasDrawnCard() ? 'Your turn! Select a card and click Discard pile to discard.' : 'Your turn! Draw from Deck or Discard pile.'
                  : `Waiting for ${activePlayer?.username || 'other'}'s turn...`}
              </span>
            </div>
            <div className="player-action-controls">
              <button onClick={handleSortRank} className="action-btn"><i className="fa-solid fa-sort-numeric-down" /> Sort Rank</button>
              <button onClick={handleSortSuit} className="action-btn"><i className="fa-solid fa-palette" /> Sort Suit</button>
              <button onClick={handleGroupSelected} className="action-btn btn-cyan-outline" disabled={selectedCards.length === 0}>
                <i className="fa-solid fa-object-group" /> Group Selected
              </button>
              <button onClick={handleClearGroups} className="action-btn"><i className="fa-solid fa-rotate-left" /> Reset Groups</button>
              <button onClick={handleDiscardClick} className="action-btn btn-rose-outline"
                disabled={!isSelfTurn || !drawnThisTurn.current || selectedCards.length !== 1}>
                <i className="fa-solid fa-trash-can" /> Discard Card
              </button>
              <button onClick={handleRevealPure} className="action-btn btn-gold-outline"
                disabled={self.revealedPureSet !== null || selectedCards.length !== 4 || !isSelfTurn || !drawnThisTurn.current}>
                <i className="fa-solid fa-star" /> Reveal Pure Set
              </button>
              {roomState.firstRevealer === currentUser.id.toString() && !roomState.jokerDisclosed && (
                <button onClick={handleDiscloseJoker} className="action-btn btn-cyan-outline">
                  <i className="fa-solid fa-eye" /> Disclose Joker
                </button>
              )}
              <button onClick={handleDeclareWin} className="action-btn btn-emerald-outline"
                disabled={!self.revealedPureSet || !isSelfTurn || handGroups.flat().length !== 10 || selectedCards.length !== 1 || !drawnThisTurn.current}>
                <i className="fa-solid fa-crown" /> Declare Win
              </button>
            </div>
          </div>

          <div className="player-hand-container">
            {self.revealedPureSet && (
              <div className="user-revealed-pure-container">
                <div className="container-title">My Revealed Pure Set</div>
                <div className="revealed-cards-row">
                  {self.revealedPureSet.map((c, i) => <Card key={i} cardCode={c} isSelected={false} isWildcard={false} />)}
                </div>
              </div>
            )}
            <div className="player-hand-wrapper">
              <div className="container-title">My Hand ({handGroups.flat().length} cards)</div>
              <div className="hand-groups-wrapper">
                {handGroups.map((group, gi) => (
                  <div key={gi} className="hand-group glass-panel">
                    <div className="group-header">Group {gi + 1}</div>
                    <div className="group-cards-row">
                      {group.map((c, i) => (
                        <Card key={i} cardCode={c} isSelected={selectedCards.includes(c)}
                          isWildcard={!!(jokerRank && getRank(c) === jokerRank)} onClick={() => handleToggleCard(c)} />
                      ))}
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

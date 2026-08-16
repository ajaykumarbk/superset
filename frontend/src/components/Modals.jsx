import React, { useState, useEffect } from 'react';
import Card from './Card';

const SUIT_SYMBOLS = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };

// 1. Rules Modal
export function RulesModal({ isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-card glass-panel rules-modal-card">
        <div className="rules-header">
          <h2><i class="fa-solid fa-book-open text-cyan"></i> Game Rules & Objective</h2>
          <button className="close-icon-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="rules-body">
          <h3>Objective</h3>
          <p>Form 4 valid card sets using your 13-card hand and the hidden wildcard joker to win the match.</p>

          <h3>The Deck & Sets</h3>
          <ul>
            <li><strong>Standard 52-Card Deck:</strong> The game uses standard card decks. For 1-3 players, we shuffle 1 deck (52 cards). For 4-6 players, we use 2 decks (104 cards).</li>
            <li><strong>Set (Book):</strong> 3 or 4 cards of the same rank (e.g. three 9s). Wildcard jokers can replace missing cards.</li>
            <li><strong>Pure Set:</strong> Exactly 4 cards of the same rank with one card of each suit (e.g. 7♠, 7♥, 7♦, 7♣). <strong>No wildcard jokers are allowed in a pure set.</strong></li>
          </ul>

          <h3>Hidden Joker Mechanic</h3>
          <ol>
            <li><strong>Phase 1: Pure Set Race:</strong> Players draw/discard each turn. The wildcard joker is unknown. Your first goal is to form a pure set of 4.</li>
            <li><strong>Phase 2: Peeking & Revelation:</strong> When you complete your pure set, you click <strong>Reveal Pure Set</strong>.
              <ul>
                <li>The <strong>first player</strong> to reveal peeks at the Hidden Joker! You now secretly know the wildcard rank.</li>
                <li>You can collect cards of the joker rank from the discard pile when other players discard them (as they don't know they are jokers).</li>
                <li>Once all players have revealed, or if you choose to disclose it manually via the <strong>Disclose Joker</strong> button, the joker is flipped face-up for everyone.</li>
              </ul>
            </li>
            <li><strong>Phase 3: Meltdown:</strong> Once the joker is disclosed, its rank becomes a wildcard for all players. Use it to complete your remaining three sets and click <strong>Declare Win</strong>!</li>
          </ol>

          <h3>Turn Loop</h3>
          <p>On your turn, you must draw a card from either the <strong>Draw Pile</strong> or the <strong>Discard Pile</strong>. Then, select a card in your hand and discard it to end your turn. Hand size goes to 14 upon drawing, and returns to 13 after discarding.</p>
        </div>
        <button onClick={onClose} className="glow-btn btn-cyan">Understood</button>
      </div>
    </div>
  );
}

// 2. Peek Secret Joker Modal
export function PeekModal({ isOpen, joker, onClose }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setFlipped(true), 500);
      return () => clearTimeout(timer);
    } else {
      setFlipped(false);
    }
  }, [isOpen]);

  if (!isOpen || !joker) return null;

  const rank = joker.slice(0, -1);
  const suit = joker.slice(-1);
  const isRed = suit === 'H' || suit === 'D';

  return (
    <div className="modal-overlay">
      <div className="modal-card glass-panel text-center pulse-border">
        <h2 className="text-gold"><i className="fa-solid fa-wand-magic-sparkles"></i> Secret Joker Peek!</h2>
        <p>As the first player to reveal your Pure Set, you get a secret look at the Hidden Joker! Collect cards of this rank strategically.</p>
        
        <div className="peek-card-wrapper">
          <div id="peek-card-anim" className={`card-inner ${flipped ? 'flipped' : ''}`}>
            <div className="card-back-side">
              <div className="joker-question">?</div>
            </div>
            <div className={`card-front card ${isRed ? 'card-red' : 'card-black'}`}>
              <div className="card-top-left">{rank}<br />{SUIT_SYMBOLS[suit]}</div>
              <div className="card-suit-large">{SUIT_SYMBOLS[suit]}</div>
              <div className="card-bottom-right">{rank}<br />{SUIT_SYMBOLS[suit]}</div>
            </div>
          </div>
        </div>

        <button onClick={onClose} className="glow-btn btn-gold">Got it, keep it secret!</button>
      </div>
    </div>
  );
}

// 3. Game Over Modal
export function GameOverModal({ isOpen, winnerId, winnerUsername, joker, finalHands, currentUserId, onClose }) {
  if (!isOpen) return null;

  const isSelf = winnerId === currentUserId?.toString();

  return (
    <div className="modal-overlay">
      <div className="modal-card glass-panel text-center">
        <div className="win-trophy-container">
          <i className="fa-solid fa-trophy text-gold large-icon"></i>
        </div>
        <h2 className={isSelf ? 'text-gold' : 'text-cyan'}>
          {isSelf ? '🏆 Victory!' : 'Defeat'}
        </h2>
        <p>{isSelf ? 'You completed all four sets and won the match!' : `Winner: ${winnerUsername}`}</p>
        
        <div className="game-over-details">
          <h4>Hidden Joker was:</h4>
          <div className="discard-pile-slot center-item">
            {joker && <Card cardCode={joker} isSelected={false} isWildcard={false} />}
          </div>

          <h4 style={{ marginTop: '15px' }}>Final Hands:</h4>
          <div className="final-hands-container">
            {finalHands && finalHands.map(player => {
              const allCards = [];
              if (player.revealedPureSet) {
                allCards.push(...player.revealedPureSet);
              }
              allCards.push(...player.hand);

              const jokerRank = joker ? joker.slice(0, -1) : null;

              return (
                <div key={player.id} className="final-hand-row">
                  <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.85rem' }}>
                    {player.username} {player.id === currentUserId?.toString() ? '(You)' : ''}:
                  </div>
                  <div className="final-hand-cards">
                    {allCards.map((c, i) => {
                      const r = c.slice(0, -1);
                      const isWild = r === jokerRank;
                      return (
                        <Card key={i} cardCode={c} isSelected={false} isWildcard={isWild} />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={onClose} className="glow-btn btn-cyan">Back to Lobby</button>
      </div>
    </div>
  );
}

// frontend/src/components/Modals/Modals.tsx
import React, { useState, useEffect } from 'react';
import Card from '../Game/Card';
import { SUIT_SYMBOLS, getRank, getSuit, isRed } from '../../utils/cardUtils';
import type { GameOverData } from '../../types';

// ── RulesModal ────────────────────────────────────────────────────────────────
export function RulesModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-card glass-panel rules-modal-card">
        <div className="rules-header">
          <h2><i className="fa-solid fa-book-open text-cyan" /> Game Rules &amp; Objective</h2>
          <button className="close-icon-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="rules-body">
          <h3>Objective</h3>
          <p>Form 4 valid card sets using your 13-card hand and the hidden wildcard joker to win the match.</p>
          <h3>The Deck &amp; Sets</h3>
          <ul>
            <li><strong>Standard 52-Card Deck:</strong> 1 deck for 1-3 players, 2 decks for 4-6 players.</li>
            <li><strong>Set (Book):</strong> 3 or 4 cards of the same rank. Wildcard jokers can replace missing cards.</li>
            <li><strong>Pure Set:</strong> Exactly 4 cards of the same rank with one card of each suit. <strong>No wildcard jokers allowed.</strong></li>
          </ul>
          <h3>Hidden Joker Mechanic</h3>
          <ol>
            <li><strong>Phase 1 – Pure Set Race:</strong> Draw/discard each turn. Your first goal is a pure set of 4.</li>
            <li><strong>Phase 2 – Peeking &amp; Revelation:</strong> First player to reveal peeks at the Hidden Joker!</li>
            <li><strong>Phase 3 – Meltdown:</strong> Joker disclosed. Use it to complete your remaining three sets and declare win!</li>
          </ol>
          <h3>Turn Loop</h3>
          <p>Draw from Deck or Discard pile → select a card → discard to end turn. Hand goes 13→14→13 each turn.</p>
        </div>
        <button onClick={onClose} className="glow-btn btn-cyan">Understood</button>
      </div>
    </div>
  );
}

// ── PeekModal ─────────────────────────────────────────────────────────────────
export function PeekModal({ isOpen, joker, onClose }: { isOpen: boolean; joker: string | null; onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (isOpen) { const t = setTimeout(() => setFlipped(true), 500); return () => clearTimeout(t); }
    else setFlipped(false);
  }, [isOpen]);

  if (!isOpen || !joker) return null;
  const rank = getRank(joker);
  const suit = getSuit(joker);
  const red  = isRed(joker);
  const sym  = SUIT_SYMBOLS[suit];

  return (
    <div className="modal-overlay">
      <div className="modal-card glass-panel text-center pulse-border">
        <h2 className="text-gold"><i className="fa-solid fa-wand-magic-sparkles" /> Secret Joker Peek!</h2>
        <p>As the first player to reveal your Pure Set, you get a secret look at the Hidden Joker!</p>
        <div className="peek-card-wrapper">
          <div id="peek-card-anim" className={`card-inner ${flipped ? 'flipped' : ''}`}>
            <div className="card-back-side"><div className="joker-question">?</div></div>
            <div className={`card-front card ${red ? 'card-red' : 'card-black'}`}>
              <div className="card-top-left">{rank}<br />{sym}</div>
              <div className="card-suit-large">{sym}</div>
              <div className="card-bottom-right">{rank}<br />{sym}</div>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="glow-btn btn-gold">Got it, keep it secret!</button>
      </div>
    </div>
  );
}

// ── GameOverModal ─────────────────────────────────────────────────────────────
export function GameOverModal({
  isOpen, winnerId, winnerUsername, joker, finalHands, currentUserId, settlementDetails, stakePerPoint, currencyType, onClose,
}: {
  isOpen: boolean;
  winnerId?: string;
  winnerUsername?: string;
  joker?: string;
  finalHands?: GameOverData['finalHands'];
  currentUserId?: number | string;
  settlementDetails?: { winnerPayout: number; totalRake: number };
  stakePerPoint?: number;
  currencyType?: 'practice' | 'cash';
  onClose: () => void;
}) {
  if (!isOpen) return null;
  const isSelf = winnerId === currentUserId?.toString();
  const jokerRank = joker ? getRank(joker) : null;
  const currLabel = currencyType === 'cash' ? '₹ Cash' : 'Chips';

  return (
    <div className="modal-overlay">
      <div className="modal-card glass-panel text-center" style={{ maxWidth: '520px' }}>
        <div className="win-trophy-container">
          <i className="fa-solid fa-trophy text-gold large-icon" />
        </div>
        <h2 className={isSelf ? 'text-gold' : 'text-cyan'}>
          {isSelf ? '🏆 Victory!' : 'Defeat'}
        </h2>
        <p>{isSelf ? 'You completed all four sets and won the match!' : `Winner: ${winnerUsername}`}</p>

        {/* Business Settlement Summary */}
        {settlementDetails && (settlementDetails.winnerPayout > 0 || settlementDetails.totalRake > 0) && (
          <div style={{ background: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: '8px', padding: '10px 15px', margin: '12px 0', textAlign: 'left' }}>
            <div style={{ fontWeight: 700, color: '#00E676', marginBottom: '4px', fontSize: '0.9rem' }}>
              💰 A23 Table Settlement ({stakePerPoint ?? 10}/pt):
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#ddd' }}>
              <span>Winner Payout:</span>
              <span style={{ fontWeight: 700, color: '#FFD700' }}>+{settlementDetails.winnerPayout.toFixed(currencyType === 'cash' ? 2 : 0)} {currLabel}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#aaa' }}>
              <span>Platform Rake (10%):</span>
              <span>{settlementDetails.totalRake.toFixed(currencyType === 'cash' ? 2 : 0)} {currLabel}</span>
            </div>
          </div>
        )}

        <div className="game-over-details">
          <h4>Hidden Joker was:</h4>
          <div className="discard-pile-slot center-item">
            {joker && <Card cardCode={joker} isSelected={false} isWildcard={false} />}
          </div>
          <h4 style={{ marginTop: '15px' }}>Final Hands:</h4>
          <div className="final-hands-container">
            {finalHands?.map(player => {
              const allCards = [...(player.revealedPureSet ?? []), ...player.hand];
              return (
                <div key={player.id} className="final-hand-row">
                  <div style={{ fontWeight: 600, marginBottom: '4px', fontSize: '0.85rem' }}>
                    {player.username} {player.id === currentUserId?.toString() ? '(You)' : ''}:
                  </div>
                  <div className="final-hand-cards">
                    {allCards.map((c, i) => (
                      <Card key={i} cardCode={c} isSelected={false} isWildcard={getRank(c) === jokerRank} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={onClose} className="glow-btn btn-cyan" style={{ marginTop: '15px' }}>Back to Lobby</button>
      </div>
    </div>
  );
}

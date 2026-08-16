import React from 'react';

const SUIT_SYMBOLS = { 'S': '♠', 'H': '♥', 'D': '♦', 'C': '♣' };

export default function Card({ cardCode, isSelected, isWildcard, onClick }) {
  if (!cardCode) return null;

  const rank = cardCode.slice(0, -1);
  const suit = cardCode.slice(-1);
  const isRed = suit === 'H' || suit === 'D';

  return (
    <div
      className={`card ${isRed ? 'card-red' : 'card-black'} ${isSelected ? 'card-selected' : ''} ${isWildcard ? 'joker-wildcard' : ''}`}
      onClick={onClick}
    >
      <div className="card-top-left">
        {rank}
        <br />
        {SUIT_SYMBOLS[suit]}
      </div>
      <div className="card-suit-large">{SUIT_SYMBOLS[suit]}</div>
      <div className="card-bottom-right">
        {rank}
        <br />
        {SUIT_SYMBOLS[suit]}
      </div>
    </div>
  );
}

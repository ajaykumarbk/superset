// frontend/src/components/Game/Card.tsx
import React from 'react';
import { SUIT_SYMBOLS, getRank, getSuit, isRed } from '../../utils/cardUtils';

interface CardProps {
  cardCode: string;
  isSelected: boolean;
  isWildcard: boolean;
  onClick?: () => void;
}

export default function Card({ cardCode, isSelected, isWildcard, onClick }: CardProps) {
  if (!cardCode) return null;
  const rank = getRank(cardCode);
  const suit = getSuit(cardCode);
  const red  = isRed(cardCode);
  const sym  = SUIT_SYMBOLS[suit];

  return (
    <div
      className={`card ${red ? 'card-red' : 'card-black'} ${isSelected ? 'card-selected' : ''} ${isWildcard ? 'joker-wildcard' : ''}`}
      onClick={onClick}
    >
      <div className="card-top-left">{rank}<br />{sym}</div>
      <div className="card-suit-large">{sym}</div>
      <div className="card-bottom-right">{rank}<br />{sym}</div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import type { CurrentUser, WalletState } from '../../types';

interface LobbyProps {
  currentUser: CurrentUser;
  wallet: WalletState | null;
  onLogout: () => void;
  onRulesClick: () => void;
  onClaimDailyBonus: () => void;
  onPlayNow: (options: { format: string; gameType: 'points' | 'pool' | 'deals' | 'practice'; stakePerPoint: number; currencyType: 'practice' | 'cash' }) => void;
}

interface LeaderboardRow { username: string; games_played: number; wins: number; }

export default function Lobby({ currentUser, wallet, onLogout, onRulesClick, onClaimDailyBonus, onPlayNow }: LobbyProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('2players');
  const [gameType, setGameType] = useState<'points' | 'pool' | 'deals' | 'practice'>('points');
  const [currencyType, setCurrencyType] = useState<'practice' | 'cash'>('practice');
  const [stakePerPoint, setStakePerPoint] = useState(10);

  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.ok ? r.json() : []).then(setLeaderboard).catch(console.error);
  }, []);

  const stakeOptions = currencyType === 'cash' ? [0.1, 0.5, 1, 5] : [10, 50, 100, 500];
  const requiredBalance = gameType === 'points' ? stakePerPoint * 80 : 0;
  const currentBalance = currencyType === 'cash' ? (wallet?.cashChips ?? 0) : (wallet?.practiceChips ?? 0);
  const isInsufficient = currentBalance < requiredBalance && gameType !== 'practice';

  return (
    <div id="lobby-screen" className="view-panel active">
      <header className="lobby-header glass-panel" style={{ flexWrap: 'wrap', gap: '15px' }}>
        <div className="user-greeting">
          <span className="user-avatar"><i className="fa-solid fa-user-ninja" /></span>
          <div>
            <h3>Welcome back,</h3>
            <h2>{currentUser.username}</h2>
          </div>
        </div>

        {/* A23 Wallet Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.3)', padding: '8px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase' }}>Practice Chips</span>
            <div style={{ color: '#FFD700', fontWeight: 700, fontSize: '1rem' }}><i className="fa-solid fa-coins" /> {wallet?.practiceChips?.toLocaleString() ?? 0}</div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)' }} />
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#aaa', textTransform: 'uppercase' }}>Cash Wallet</span>
            <div style={{ color: '#00E676', fontWeight: 700, fontSize: '1rem' }}><i className="fa-solid fa-indian-rupee-sign" /> {wallet?.cashChips?.toFixed(2) ?? '0.00'}</div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)' }} />
          <button
            onClick={onClaimDailyBonus}
            disabled={!wallet?.canClaimDailyBonus}
            className="glow-btn"
            style={{
              padding: '6px 12px', fontSize: '0.8rem', background: wallet?.canClaimDailyBonus ? 'linear-gradient(45deg, #FF9100, #FFEA00)' : '#444',
              color: wallet?.canClaimDailyBonus ? '#000' : '#888', border: 'none', borderRadius: '6px', cursor: wallet?.canClaimDailyBonus ? 'pointer' : 'default',
              fontWeight: 700
            }}
          >
            {wallet?.canClaimDailyBonus ? '🎁 Daily Bonus' : '⏱️ Bonus Claimed'}
          </button>
        </div>

        <button onClick={onLogout} className="icon-btn" title="Logout">
          <i className="fa-solid fa-right-from-bracket" />
        </button>
      </header>

      <div className="lobby-grid">
        <div className="lobby-section glass-panel">
          <div className="section-header">
            <h2><i className="fa-solid fa-gamepad" /> A23 Matchmaking Table</h2>
            <button onClick={onRulesClick} className="rules-btn"><i className="fa-solid fa-book-open" /> Rules</button>
          </div>

          {/* Game Type & Currency Tabs */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <button
              style={{ flex: 1, padding: '10px', borderRadius: '8px', background: currencyType === 'practice' ? 'var(--neon-ruby, #e91e63)' : 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 600, cursor: 'pointer' }}
              onClick={() => { setCurrencyType('practice'); setStakePerPoint(10); }}
            >
              🎮 Practice Chips
            </button>
            <button
              style={{ flex: 1, padding: '10px', borderRadius: '8px', background: currencyType === 'cash' ? 'linear-gradient(45deg, #00C853, #64DD17)' : 'rgba(255,255,255,0.05)', color: currencyType === 'cash' ? '#000' : '#fff', border: '1px solid rgba(255,255,255,0.2)', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => { setCurrencyType('cash'); setStakePerPoint(0.1); }}
            >
              💵 Real Cash Tables
            </button>
          </div>

          {/* Stake Selector */}
          <div style={{ marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: '#ccc', fontSize: '0.85rem', fontWeight: 600 }}>
              Select Table Stake ({currencyType === 'cash' ? '₹ / point' : 'Chips / point'})
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              {stakeOptions.map(st => (
                <button
                  key={st}
                  onClick={() => setStakePerPoint(st)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '6px', border: stakePerPoint === st ? '2px solid #00E676' : '1px solid rgba(255,255,255,0.1)',
                    background: stakePerPoint === st ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  {currencyType === 'cash' ? `₹${st}` : `${st} pts`}
                </button>
              ))}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.8rem', color: isInsufficient ? '#FF5252' : '#888' }}>
              Minimum Required Balance (80 pts cap): <strong>{requiredBalance.toLocaleString()} {currencyType === 'cash' ? 'Cash' : 'Chips'}</strong>
            </div>
          </div>

          {/* Table Capacity Options */}
          <div className="format-selection-grid">
            <div className={`format-card ${selectedFormat === '2players' ? 'selected' : ''}`} onClick={() => setSelectedFormat('2players')}>
              <div className="format-icon"><i className="fa-solid fa-user-friends" /></div>
              <div className="format-name">Points Rummy (2 Players)</div>
              <div className="format-desc">Fast 1v1 Head-to-Head table. Stake: {stakePerPoint}/pt. 10% platform rake.</div>
            </div>
            <div className={`format-card ${selectedFormat === '6players' ? 'selected' : ''}`} onClick={() => setSelectedFormat('6players')}>
              <div className="format-icon"><i className="fa-solid fa-users" /></div>
              <div className="format-name">Points Rummy (6 Players)</div>
              <div className="format-desc">Classic 6-player table tournament. High pot multiplayer match.</div>
            </div>
            <div className={`format-card ${selectedFormat === '1vbot' ? 'selected' : ''}`} onClick={() => setSelectedFormat('1vbot')}>
              <div className="format-icon"><i className="fa-solid fa-robot" /></div>
              <div className="format-name">Practice vs Bot (Free)</div>
              <div className="format-desc">Free single-player bot game to hone skills without stake risk.</div>
            </div>
          </div>

          <div className="lobby-action-box" style={{ flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={() => onPlayNow({
                format: selectedFormat,
                gameType: selectedFormat === '1vbot' ? 'practice' : 'points',
                stakePerPoint,
                currencyType
              })}
              disabled={isInsufficient && selectedFormat !== '1vbot'}
              className="play-now-btn"
              style={{ opacity: (isInsufficient && selectedFormat !== '1vbot') ? 0.5 : 1, cursor: (isInsufficient && selectedFormat !== '1vbot') ? 'not-allowed' : 'pointer' }}
            >
              {isInsufficient && selectedFormat !== '1vbot' ? 'INSUFFICIENT BALANCE' : 'JOIN TABLE & PLAY'}
            </button>
          </div>
        </div>

        <div className="lobby-section glass-panel">
          <div className="section-header">
            <h2><i className="fa-solid fa-trophy text-gold" /> Global Leaderboard</h2>
          </div>
          <div className="leaderboard-container">
            <table className="leaderboard-table">
              <thead><tr><th>Rank</th><th>Player</th><th>Played</th><th>Wins</th><th>Win Rate</th></tr></thead>
              <tbody>
                {leaderboard.map((row, i) => {
                  const wr = row.games_played > 0 ? Math.round((row.wins / row.games_played) * 100) : 0;
                  return (
                    <tr key={i}>
                      <td><strong>#{i + 1}</strong></td>
                      <td>{row.username}</td>
                      <td>{row.games_played}</td>
                      <td>{row.wins}</td>
                      <td>{wr}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

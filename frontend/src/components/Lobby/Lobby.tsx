// frontend/src/components/Lobby/Lobby.tsx
import React, { useState, useEffect } from 'react';
import type { CurrentUser } from '../../types';

interface LobbyProps {
  currentUser: CurrentUser;
  onLogout: () => void;
  onRulesClick: () => void;
  onPlayNow: (format: string) => void;
}

interface LeaderboardRow { username: string; games_played: number; wins: number; }

export default function Lobby({ currentUser, onLogout, onRulesClick, onPlayNow }: LobbyProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [selectedFormat, setSelectedFormat] = useState('2players');

  useEffect(() => {
    fetch('/api/leaderboard').then(r => r.ok ? r.json() : []).then(setLeaderboard).catch(console.error);
  }, []);

  const formats = [
    { id: '2players', icon: 'fa-user-friends', name: 'Points Rummy (2P)', desc: 'Fast 1v1 matchmaking. Match with players or starts with bots after 7s.' },
    { id: '6players', icon: 'fa-users',        name: 'Points Rummy (6P)', desc: 'Classic 6-player table. Max strategy against 5 opponents.' },
    { id: '1vbot',    icon: 'fa-robot',         name: 'Practice Game (1 v Bot)', desc: 'Hone your skills in a quick solo match against our AI. Starts instantly.' },
  ];

  return (
    <div id="lobby-screen" className="view-panel active">
      <header className="lobby-header glass-panel">
        <div className="user-greeting">
          <span className="user-avatar"><i className="fa-solid fa-user-ninja" /></span>
          <div>
            <h3>Welcome back,</h3>
            <h2>{currentUser.username}</h2>
          </div>
        </div>
        <div className="lobby-title-container">
          <h1 className="logo-text">SUPERSET</h1>
          <p className="subtitle-text">Multiplayer Arena</p>
        </div>
        <button onClick={onLogout} className="icon-btn" title="Logout">
          <i className="fa-solid fa-right-from-bracket" />
        </button>
      </header>

      <div className="lobby-grid">
        <div className="lobby-section glass-panel">
          <div className="section-header">
            <h2><i className="fa-solid fa-gamepad" /> Select Game Table</h2>
            <button onClick={onRulesClick} className="rules-btn"><i className="fa-solid fa-book-open" /> Rules</button>
          </div>
          <div className="format-selection-grid">
            {formats.map(f => (
              <div key={f.id} className={`format-card ${selectedFormat === f.id ? 'selected' : ''}`}
                onClick={() => setSelectedFormat(f.id)}>
                <div className="format-icon"><i className={`fa-solid ${f.icon}`} /></div>
                <div className="format-name">{f.name}</div>
                <div className="format-desc">{f.desc}</div>
              </div>
            ))}
          </div>
          <div className="lobby-action-box">
            <button onClick={() => onPlayNow(selectedFormat)} className="play-now-btn">PLAY NOW</button>
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

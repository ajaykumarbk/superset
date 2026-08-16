import React, { useState, useEffect } from 'react';

export default function Lobby({ currentUser, onLogout, onRulesClick, onPlayNow }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('2players');

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (err) {
      console.error('Error loading leaderboard:', err);
    }
  };

  return (
    <div id="lobby-screen" className="view-panel active">
      <header className="lobby-header glass-panel">
        <div className="user-greeting">
          <span className="user-avatar"><i className="fa-solid fa-user-ninja"></i></span>
          <div>
            <h3>Welcome back,</h3>
            <h2>{currentUser?.username || 'Player'}</h2>
          </div>
        </div>
        <div className="lobby-title-container">
          <h1 className="logo-text">SUPERSET</h1>
          <p className="subtitle-text">Multiplayer Arena</p>
        </div>
        <button onClick={onLogout} className="icon-btn" title="Logout">
          <i className="fa-solid fa-right-from-bracket"></i>
        </button>
      </header>

      <div className="lobby-grid">
        {/* Game Selection Cards */}
        <div className="lobby-section glass-panel">
          <div className="section-header">
            <h2><i className="fa-solid fa-gamepad"></i> Select Game Table</h2>
            <button onClick={onRulesClick} className="rules-btn">
              <i className="fa-solid fa-book-open"></i> Rules
            </button>
          </div>

          <div className="format-selection-grid">
            <div 
              className={`format-card ${selectedFormat === '2players' ? 'selected' : ''}`}
              onClick={() => setSelectedFormat('2players')}
            >
              <div className="format-icon"><i className="fa-solid fa-user-friends"></i></div>
              <div className="format-name">Points Rummy (2P)</div>
              <div className="format-desc">Fast 1v1 matchmaking. Match with players or starts with bots after 7s.</div>
            </div>

            <div 
              className={`format-card ${selectedFormat === '6players' ? 'selected' : ''}`}
              onClick={() => setSelectedFormat('6players')}
            >
              <div className="format-icon"><i className="fa-solid fa-users"></i></div>
              <div className="format-name">Points Rummy (6P)</div>
              <div className="format-desc">Classic 6-player table. Max strategy against 5 opponents.</div>
            </div>

            <div 
              className={`format-card ${selectedFormat === '1vbot' ? 'selected' : ''}`}
              onClick={() => setSelectedFormat('1vbot')}
            >
              <div className="format-icon"><i className="fa-solid fa-robot"></i></div>
              <div className="format-name">Practice Game (1 v Bot)</div>
              <div className="format-desc">Hone your skills in a quick solo match against our AI. Starts instantly.</div>
            </div>
          </div>

          <div className="lobby-action-box">
            <button 
              onClick={() => onPlayNow(selectedFormat)}
              className="play-now-btn"
            >
              PLAY NOW
            </button>
          </div>
        </div>

        {/* Leaderboard Section */}
        <div className="lobby-section glass-panel">
          <div className="section-header">
            <h2><i className="fa-solid fa-trophy text-gold"></i> Global Leaderboard</h2>
          </div>
          <div className="leaderboard-container">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Player</th>
                  <th>Played</th>
                  <th>Wins</th>
                  <th>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row, index) => {
                  const winRate = row.games_played > 0 ? Math.round((row.wins / row.games_played) * 100) : 0;
                  return (
                    <tr key={index}>
                      <td><strong>#{index + 1}</strong></td>
                      <td>{row.username}</td>
                      <td>{row.games_played}</td>
                      <td>{row.wins}</td>
                      <td>{winRate}%</td>
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

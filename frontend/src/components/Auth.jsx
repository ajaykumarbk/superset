import React, { useState } from 'react';

export default function Auth({ onAuthSuccess, onRulesClick }) {
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (res.ok) {
        onAuthSuccess(data);
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }
  };

  return (
    <div id="auth-screen" className="view-panel active">
      <div className="auth-card glass-panel">
        <h1 className="game-logo">SUPERSET</h1>
        <h2 class="game-subtitle">THE HIDDEN JOKER</h2>

        <div className="tab-buttons">
          <button
            type="button"
            className={`tab-btn ${authMode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('login');
              setError(null);
            }}
          >
            Login
          </button>
          <button
            type="button"
            className={`tab-btn ${authMode === 'register' ? 'active' : ''}`}
            onClick={() => {
              setAuthMode('register');
              setError(null);
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username"><i className="fa-solid fa-user"></i> Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoComplete="off"
            />
          </div>
          <div className="input-group">
            <label htmlFor="password"><i className="fa-solid fa-lock"></i> Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              required
            />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="glow-btn btn-cyan">
            {authMode === 'login' ? 'Login to Lobby' : 'Register Account'}
          </button>
        </form>

        <div className="rules-teaser" onClick={onRulesClick}>
          <i className="fa-solid fa-circle-question"></i> How to Play & Game Rules
        </div>
      </div>
    </div>
  );
}

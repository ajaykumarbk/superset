// frontend/src/components/Auth/Auth.tsx
import React, { useState } from 'react';
import type { CurrentUser } from '../../types';

interface AuthProps {
  onAuthSuccess: (user: CurrentUser) => void;
  onRulesClick: () => void;
}

export default function Auth({ onAuthSuccess, onRulesClick }: AuthProps) {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok) onAuthSuccess(data);
      else setError(data.error || 'Authentication failed');
    } catch {
      setError('Network error. Please try again.');
    }
  };

  return (
    <div id="auth-screen" className="view-panel active">
      <div className="auth-card glass-panel">
        <h1 className="game-logo">SUPERSET</h1>
        <h2 className="game-subtitle">THE HIDDEN JOKER</h2>

        <div className="tab-buttons">
          {(['login', 'register'] as const).map(mode => (
            <button key={mode} type="button"
              className={`tab-btn ${authMode === mode ? 'active' : ''}`}
              onClick={() => { setAuthMode(mode); setError(null); }}>
              {mode === 'login' ? 'Login' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username"><i className="fa-solid fa-user" /> Username</label>
            <input type="text" id="username" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Enter username" required autoComplete="off" />
          </div>
          <div className="input-group">
            <label htmlFor="password"><i className="fa-solid fa-lock" /> Password</label>
            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter password" required />
          </div>
          {error && <div className="error-msg">{error}</div>}
          <button type="submit" className="glow-btn btn-cyan">
            {authMode === 'login' ? 'Login to Lobby' : 'Register Account'}
          </button>
        </form>

        <div className="rules-teaser" onClick={onRulesClick}>
          <i className="fa-solid fa-circle-question" /> How to Play &amp; Game Rules
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Auth from './components/Auth';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import { RulesModal, GameOverModal, PeekModal } from './components/Modals';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [activeView, setActiveView] = useState('auth'); // 'auth', 'lobby', 'game'
  const [currentRoomState, setCurrentRoomState] = useState(null);
  
  // Game state
  const [logs, setLogs] = useState([]);
  const [secretJoker, setSecretJoker] = useState(null);
  
  // Modal states
  const [rulesOpen, setRulesOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [gameOverOpen, setGameOverOpen] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);

  // Errors state
  const [floatingError, setFloatingError] = useState(null);

  // Matchmaking states
  const [matchmakingFormat, setMatchmakingFormat] = useState(null);
  const [queueStatus, setQueueStatus] = useState({ position: 0, needed: 0 });
  const [matchmakingTimer, setMatchmakingTimer] = useState(0);

  // Verify session on mount
  useEffect(() => {
    fetch('/api/me')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then(user => {
        setCurrentUser(user);
        setActiveView('lobby');
      })
      .catch(() => {
        setActiveView('auth');
      });
  }, []);

  // Sync WebSocket connection with active session
  useEffect(() => {
    if (currentUser) {
      const s = io();
      setSocket(s);

      s.on('room_state', (state) => {
        setCurrentRoomState(state);
        setMatchmakingFormat(null); // Cancel searching when room starts
        if (state.status === 'playing' || state.status === 'waiting') {
          setActiveView('game');
        }
      });

      s.on('matchmaking_status', (data) => {
        setMatchmakingFormat('searching');
        setQueueStatus(data);
      });

      s.on('joker_peek', ({ joker }) => {
        setSecretJoker(joker);
        setPeekOpen(true);
      });

      s.on('joker_disclosed', ({ joker }) => {
        setSecretJoker(joker);
        addLog(`📢 Wildcard Joker Disclosed! It is the ${joker}. All cards of rank ${joker.slice(0, -1)} are now wildcards.`);
      });

      s.on('game_log', (msg) => {
        addLog(msg);
      });

      s.on('game_over', ({ winnerId, winnerUsername, finalHands, joker }) => {
        setGameOverData({ winnerId, winnerUsername, finalHands, joker });
        setGameOverOpen(true);
        setCurrentRoomState(null);
        setSecretJoker(null);
        setLogs([]);
      });

      s.on('error_message', (msg) => {
        showFloatingError(msg);
      });

      return () => {
        s.disconnect();
      };
    } else {
      setSocket(null);
      setCurrentRoomState(null);
      setLogs([]);
      setSecretJoker(null);
    }
  }, [currentUser]);

  const addLog = (message) => {
    const timeStr = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timeStr}] ${message}`]);
  };

  const showFloatingError = (msg) => {
    setFloatingError(msg);
    setTimeout(() => {
      setFloatingError(null);
    }, 3500);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/logout', { method: 'POST' });
      if (res.ok) {
        setCurrentUser(null);
        setActiveView('auth');
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Matchmaking timer effect
  useEffect(() => {
    let interval = null;
    if (matchmakingFormat) {
      interval = setInterval(() => {
        setMatchmakingTimer(prev => prev + 1);
      }, 1000);
    } else {
      setMatchmakingTimer(0);
    }
    return () => clearInterval(interval);
  }, [matchmakingFormat]);

  const handlePlayNow = (format) => {
    if (!socket || !currentUser) return;
    setMatchmakingTimer(0);
    setQueueStatus({ position: 1, needed: format === '2players' ? 2 : 6 });

    if (format === '1vbot') {
      socket.emit('join_matchmaking', { format, userId: currentUser.id, username: currentUser.username });
    } else {
      setMatchmakingFormat(format);
      socket.emit('join_matchmaking', { format, userId: currentUser.id, username: currentUser.username });
    }
  };

  const handleCancelMatchmaking = () => {
    if (!socket || !currentUser) return;
    socket.emit('leave_matchmaking', { userId: currentUser.id });
    setMatchmakingFormat(null);
  };

  return (
    <>
      <div className="table-glow-overlay"></div>
      <div className="app-container">
        {activeView === 'auth' && (
          <Auth
            onAuthSuccess={(user) => {
              setCurrentUser(user);
              setActiveView('lobby');
            }}
            onRulesClick={() => setRulesOpen(true)}
          />
        )}

        {activeView === 'lobby' && socket && (
          <Lobby
            currentUser={currentUser}
            onLogout={handleLogout}
            onPlayNow={handlePlayNow}
            onRulesClick={() => setRulesOpen(true)}
          />
        )}

        {activeView === 'game' && socket && currentRoomState && (
          <GameBoard
            currentUser={currentUser}
            socket={socket}
            roomState={currentRoomState}
            logs={logs}
            secretJoker={secretJoker}
            onLeaveRoom={() => {
              // Reload page or disconnect room to prevent socket ghosts
              window.location.reload();
            }}
            onRulesClick={() => setRulesOpen(true)}
            showFloatingError={showFloatingError}
          />
        )}
      </div>

      {/* Matchmaking queue radar overlay */}
      {matchmakingFormat && (
        <div className="matchmaking-overlay">
          <div className="radar-container">
            <div className="radar-glow-circle"></div>
            <div className="radar-glow-circle inner"></div>
            <div className="radar-glow-circle core"></div>
            <div className="radar-sweep-ray"></div>
          </div>
          <h2 className="matchmaking-title">MATCHMAKING...</h2>
          <div className="matchmaking-timer">
            Time elapsed: {Math.floor(matchmakingTimer / 60).toString().padStart(2, '0')}:{(matchmakingTimer % 60).toString().padStart(2, '0')}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontStyle: 'italic' }}>
            {queueStatus.position > 0 ? `Players in queue: ${queueStatus.position} / ${queueStatus.needed}` : 'Connecting to table...'}
          </div>
          <button 
            onClick={handleCancelMatchmaking} 
            className="glow-btn btn-rose"
            style={{ marginTop: '10px', padding: '10px 30px' }}
          >
            Cancel Search
          </button>
        </div>
      )}

      {/* Overlays */}
      <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />
      
      <PeekModal
        isOpen={peekOpen}
        joker={secretJoker}
        onClose={() => setPeekOpen(false)}
      />

      <GameOverModal
        isOpen={gameOverOpen}
        winnerId={gameOverData?.winnerId}
        winnerUsername={gameOverData?.winnerUsername}
        joker={gameOverData?.joker}
        finalHands={gameOverData?.finalHands}
        currentUserId={currentUser?.id}
        onClose={() => {
          setGameOverOpen(false);
          setGameOverData(null);
          setActiveView('lobby');
        }}
      />

      {/* Floating alert */}
      {floatingError && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: 'rgba(255, 0, 127, 0.9)',
          border: '1px solid var(--neon-ruby)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          boxShadow: '0 0 15px rgba(255, 0, 127, 0.4)',
          zIndex: '1000',
          fontFamily: 'var(--font-sans)',
          fontWeight: '600',
          fontSize: '0.9rem'
        }}>
          <i className="fa-solid fa-circle-exclamation" style={{ marginRight: '8px' }}></i>
          {floatingError}
        </div>
      )}
    </>
  );
}

// frontend/src/App.tsx
import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

import Layout from './components/Layout';
import Auth from './components/Auth/Auth';
import Lobby from './components/Lobby/Lobby';
import GameBoard from './components/Game/GameBoard';
import { RulesModal, GameOverModal, PeekModal } from './components/Modals/Modals';

import { useMatchmakingTimer } from './hooks/useMatchmaking';
import type { CurrentUser, RoomState, GameOverData, QueueStatus, WalletState } from './types';

export default function App() {
  const [currentUser,       setCurrentUser]       = useState<CurrentUser | null>(null);
  const [wallet,            setWallet]            = useState<WalletState | null>(null);
  const [socket,            setSocket]            = useState<Socket | null>(null);
  const [activeView,        setActiveView]        = useState<'auth' | 'lobby' | 'game'>('auth');
  const [currentRoomState,  setCurrentRoomState]  = useState<RoomState | null>(null);

  const [logs,              setLogs]              = useState<string[]>([]);
  const [secretJoker,       setSecretJoker]       = useState<string | null>(null);

  const [rulesOpen,         setRulesOpen]         = useState(false);
  const [peekOpen,          setPeekOpen]          = useState(false);
  const [gameOverOpen,      setGameOverOpen]      = useState(false);
  const [gameOverData,      setGameOverData]      = useState<GameOverData | null>(null);
  const [floatingError,     setFloatingError]     = useState<string | null>(null);

  const [matchmakingFormat, setMatchmakingFormat] = useState<string | null>(null);
  const [queueStatus,       setQueueStatus]       = useState<QueueStatus>({ position: 0, needed: 0 });

  const matchmakingTimer = useMatchmakingTimer(!!matchmakingFormat);

  const fetchWallet = () => {
    fetch('/api/wallet/balance')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setWallet(data); })
      .catch(console.error);
  };

  // Verify session on mount
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((user: CurrentUser) => {
        setCurrentUser(user);
        setActiveView('lobby');
        fetchWallet();
      })
      .catch(() => setActiveView('auth'));
  }, []);

  // Socket lifecycle tied to auth
  useEffect(() => {
    if (!currentUser) { setSocket(null); setCurrentRoomState(null); setLogs([]); setSecretJoker(null); return; }
    const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || undefined;
    const s = backendUrl ? io(backendUrl) : io();
    setSocket(s);

    s.on('room_state', (state: RoomState) => {
      setCurrentRoomState(state);
      setMatchmakingFormat(null);
      if (state.status === 'playing' || state.status === 'waiting') setActiveView('game');
    });
    s.on('matchmaking_status', (data: QueueStatus) => { setMatchmakingFormat('searching'); setQueueStatus(data); });
    s.on('joker_peek',      ({ joker }: { joker: string }) => { setSecretJoker(joker); setPeekOpen(true); });
    s.on('joker_disclosed', ({ joker }: { joker: string }) => {
      setSecretJoker(joker);
      addLog(`📢 Wildcard Joker Disclosed! Rank ${joker.slice(0, -1)} cards are now wildcards.`);
    });
    s.on('game_log',  (msg: string) => addLog(msg));
    s.on('game_over', (data: GameOverData) => {
      setGameOverData(data); setGameOverOpen(true);
      setCurrentRoomState(null); setSecretJoker(null); setLogs([]);
      fetchWallet();
    });
    s.on('error_message', (msg: string) => {
      setMatchmakingFormat(null);
      showFloatingError(msg);
    });

    return () => { s.disconnect(); };
  }, [currentUser]);

  const addLog = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${t}] ${msg}`]);
  };

  const showFloatingError = (msg: string) => {
    setFloatingError(msg);
    setTimeout(() => setFloatingError(null), 3500);
  };

  const handleLogout = async () => {
    const res = await fetch('/api/logout', { method: 'POST' });
    if (res.ok) { setCurrentUser(null); setWallet(null); setActiveView('auth'); }
  };

  const handleClaimDailyBonus = async () => {
    try {
      const res = await fetch('/api/wallet/daily-bonus', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.wallet) {
        setWallet(data.wallet);
        showFloatingError(`🎉 ${data.message}`);
      } else {
        showFloatingError(data.message || 'Failed to claim daily bonus.');
      }
    } catch {
      showFloatingError('Network error trying to claim bonus.');
    }
  };

  const handlePlayNow = (options: { format: string; gameType: 'points' | 'pool' | 'deals' | 'practice'; stakePerPoint: number; currencyType: 'practice' | 'cash' }) => {
    if (!socket || !currentUser) return;
    const { format, gameType, stakePerPoint, currencyType } = options;
    setQueueStatus({ position: 1, needed: format === '2players' ? 2 : 6 });
    if (format !== '1vbot') setMatchmakingFormat(format);
    socket.emit('join_matchmaking', {
      format, gameType, stakePerPoint, currencyType,
      userId: currentUser.id, username: currentUser.username
    });
  };

  const handleCancelMatchmaking = () => {
    if (!socket || !currentUser) return;
    socket.emit('leave_matchmaking', { userId: currentUser.id });
    setMatchmakingFormat(null);
  };

  const mm = String(Math.floor(matchmakingTimer / 60)).padStart(2, '0');
  const ss = String(matchmakingTimer % 60).padStart(2, '0');

  return (
    <>
      <Layout>
        {activeView === 'auth' && (
          <Auth onAuthSuccess={user => { setCurrentUser(user); setActiveView('lobby'); fetchWallet(); }} onRulesClick={() => setRulesOpen(true)} />
        )}
        {activeView === 'lobby' && socket && currentUser && (
          <Lobby
            currentUser={currentUser}
            wallet={wallet}
            onLogout={handleLogout}
            onClaimDailyBonus={handleClaimDailyBonus}
            onPlayNow={handlePlayNow}
            onRulesClick={() => setRulesOpen(true)}
          />
        )}
        {activeView === 'game' && socket && currentRoomState && currentUser && (
          <GameBoard
            currentUser={currentUser} socket={socket} roomState={currentRoomState}
            logs={logs} secretJoker={secretJoker}
            onLeaveRoom={() => window.location.reload()}
            onRulesClick={() => setRulesOpen(true)}
            showFloatingError={showFloatingError}
          />
        )}
      </Layout>

      {/* Matchmaking overlay */}
      {matchmakingFormat && (
        <div className="matchmaking-overlay">
          <div className="radar-container">
            <div className="radar-glow-circle" /><div className="radar-glow-circle inner" />
            <div className="radar-glow-circle core" /><div className="radar-sweep-ray" />
          </div>
          <h2 className="matchmaking-title">MATCHMAKING...</h2>
          <div className="matchmaking-timer">Time elapsed: {mm}:{ss}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', fontStyle: 'italic' }}>
            {queueStatus.position > 0 ? `Players in queue: ${queueStatus.position} / ${queueStatus.needed}` : 'Connecting to table...'}
          </div>
          <button onClick={handleCancelMatchmaking} className="glow-btn btn-rose" style={{ marginTop: '10px', padding: '10px 30px' }}>
            Cancel Search
          </button>
        </div>
      )}

      <RulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} />
      <PeekModal  isOpen={peekOpen}  joker={secretJoker} onClose={() => setPeekOpen(false)} />
      <GameOverModal
        isOpen={gameOverOpen} winnerId={gameOverData?.winnerId} winnerUsername={gameOverData?.winnerUsername}
        joker={gameOverData?.joker} finalHands={gameOverData?.finalHands} currentUserId={currentUser?.id}
        settlementDetails={gameOverData?.settlementDetails} stakePerPoint={gameOverData?.stakePerPoint} currencyType={gameOverData?.currencyType}
        onClose={() => { setGameOverOpen(false); setGameOverData(null); setActiveView('lobby'); }}
      />

      {floatingError && (
        <div style={{ position:'fixed', bottom:'20px', right:'20px', background:'rgba(255,0,127,0.9)',
          border:'1px solid var(--neon-ruby)', color:'#fff', padding:'12px 24px', borderRadius:'8px',
          boxShadow:'0 0 15px rgba(255,0,127,0.4)', zIndex:1000, fontFamily:'var(--font-sans)', fontWeight:600, fontSize:'0.9rem' }}>
          <i className="fa-solid fa-circle-exclamation" style={{ marginRight:'8px' }} />{floatingError}
        </div>
      )}
    </>
  );
}

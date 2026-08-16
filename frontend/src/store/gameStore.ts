// frontend/src/store/gameStore.ts
// Lightweight React context for shared game state.
import React, { createContext, useContext, useReducer } from 'react';
import type { RoomState, CurrentUser, GameOverData, QueueStatus } from '../types';

interface GameState {
  currentUser: CurrentUser | null;
  activeView: 'auth' | 'lobby' | 'game';
  currentRoomState: RoomState | null;
  logs: string[];
  secretJoker: string | null;
  rulesOpen: boolean;
  peekOpen: boolean;
  gameOverOpen: boolean;
  gameOverData: GameOverData | null;
  floatingError: string | null;
  matchmakingFormat: string | null;
  queueStatus: QueueStatus;
}

type Action =
  | { type: 'SET_USER';          payload: CurrentUser | null }
  | { type: 'SET_VIEW';          payload: GameState['activeView'] }
  | { type: 'SET_ROOM';          payload: RoomState | null }
  | { type: 'ADD_LOG';           payload: string }
  | { type: 'CLEAR_LOGS' }
  | { type: 'SET_SECRET_JOKER';  payload: string | null }
  | { type: 'SET_RULES_OPEN';    payload: boolean }
  | { type: 'SET_PEEK_OPEN';     payload: boolean }
  | { type: 'SET_GAME_OVER';     payload: { open: boolean; data: GameOverData | null } }
  | { type: 'SET_FLOATING_ERROR';payload: string | null }
  | { type: 'SET_MATCHMAKING';   payload: { format: string | null; status?: QueueStatus } };

const initial: GameState = {
  currentUser: null,
  activeView: 'auth',
  currentRoomState: null,
  logs: [],
  secretJoker: null,
  rulesOpen: false,
  peekOpen: false,
  gameOverOpen: false,
  gameOverData: null,
  floatingError: null,
  matchmakingFormat: null,
  queueStatus: { position: 0, needed: 0 },
};

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'SET_USER':          return { ...state, currentUser: action.payload };
    case 'SET_VIEW':          return { ...state, activeView: action.payload };
    case 'SET_ROOM':          return { ...state, currentRoomState: action.payload };
    case 'ADD_LOG':           return { ...state, logs: [...state.logs, action.payload] };
    case 'CLEAR_LOGS':        return { ...state, logs: [] };
    case 'SET_SECRET_JOKER':  return { ...state, secretJoker: action.payload };
    case 'SET_RULES_OPEN':    return { ...state, rulesOpen: action.payload };
    case 'SET_PEEK_OPEN':     return { ...state, peekOpen: action.payload };
    case 'SET_GAME_OVER':     return { ...state, gameOverOpen: action.payload.open, gameOverData: action.payload.data };
    case 'SET_FLOATING_ERROR':return { ...state, floatingError: action.payload };
    case 'SET_MATCHMAKING':   return {
      ...state,
      matchmakingFormat: action.payload.format,
      queueStatus: action.payload.status ?? state.queueStatus,
    };
    default: return state;
  }
}

const GameContext = createContext<{ state: GameState; dispatch: React.Dispatch<Action> } | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return React.createElement(GameContext.Provider, { value: { state, dispatch } }, children);
}

export function useGameStore() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameStore must be used within GameProvider');
  return ctx;
}

// frontend/src/hooks/useSocket.ts
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { CurrentUser } from '../types';

export function useSocket(currentUser: CurrentUser | null): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!currentUser) { setSocket(null); return; }
    const s = io();
    setSocket(s);
    return () => { s.disconnect(); };
  }, [currentUser]);

  return socket;
}

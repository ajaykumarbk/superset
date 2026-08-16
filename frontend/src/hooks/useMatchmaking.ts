// frontend/src/hooks/useMatchmaking.ts
import { useEffect, useState } from 'react';

export function useMatchmakingTimer(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) { setElapsed(0); return; }
    const id = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  return elapsed;
}

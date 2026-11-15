import { useEffect, useState } from 'react';

const clock = () => Date.now();

/** 45 → "0:45". */
export const formatClock = (s: number) =>
  `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

/**
 * Seconds left until `until` (epoch ms), ticking every second; 0 when null or past. Right after
 * `until` changes it may read up to a second high, never a false 0 (safe for auto-renew).
 */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!until) return;
    const tick = () => setNow(clock());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

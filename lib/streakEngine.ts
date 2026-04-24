/**
 * lib/streakEngine.ts — CRM-side streak reader
 *
 * The supervisor and reinforcement feedback write streak data to users.streak.
 * The CRM API routes read it here. No writes from the CRM side.
 */

import type { Db } from "mongodb";

export interface StreakState {
  current:     number;
  best:        number;
  lastWinDate: string | null;
  history:     { date: string; won: boolean }[];
  atRisk:      boolean;  // streak exists but today not logged yet
}

export function streakMicrocopy(current: number, atRisk: boolean): string {
  if (atRisk && current > 0) {
    return "⚠️ Streak at risk — no activity detected today";
  }
  if (current === 0) {
    return "Nova is recalibrating for your next growth cycle";
  }
  if (current >= 14) {
    return `High momentum — your engine is compounding results`;
  }
  if (current >= 7) {
    return `Nova has improved your site ${current} days in a row`;
  }
  if (current >= 3) {
    return `Strong run — Nova is improving your site consistently`;
  }
  return `Nova has improved your site ${current} day${current === 1 ? '' : 's'} in a row`;
}

export function streakIcon(current: number, atRisk: boolean): string {
  if (atRisk) return "⚠️";
  if (current >= 14) return "🔥";
  if (current >= 7)  return "🔥";
  if (current >= 3)  return "🔥";
  if (current === 0) return "⚡";
  return "🔥";
}

export async function getStreakState(db: Db, userId: string): Promise<StreakState> {
  const user = await db.collection("users").findOne(
    { _id: userId as any },
    { projection: { streak: 1 } }
  );

  const streak   = user?.streak ?? {};
  const current  = streak.current     ?? 0;
  const best     = streak.best        ?? 0;
  const lastWin  = streak.lastWinDate ?? null;
  const history  = streak.history     ?? [];

  // At-risk: streak > 0 but today hasn't been counted yet
  const today    = new Date().toISOString().slice(0, 10);
  const todayEntry = history.find((h: any) => h.date === today);
  const atRisk   = current > 0 && !todayEntry;

  return { current, best, lastWinDate: lastWin, history, atRisk };
}

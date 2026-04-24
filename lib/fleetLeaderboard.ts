/**
 * lib/fleetLeaderboard.ts — CRM-side mirror of drone src/shared/fleetLeaderboard.ts
 *
 * Reads the `leaderboard` collection snapshot maintained by the supervisor.
 * The supervisor rebuilds it on each health tick — the CRM just reads it.
 */

import type { Db } from "mongodb";

export type LeaderboardTier =
  | "Top 1%"   | "Top 5%"   | "Top 10%"
  | "Top 25%"  | "Building";

export interface LeaderboardEntry {
  userId:     string;
  score:      number;
  percentile: number;
  rank:       number;
  total:      number;
  tier:       LeaderboardTier;
}

export function assignTier(percentile: number): LeaderboardTier {
  if (percentile >= 99) return "Top 1%";
  if (percentile >= 95) return "Top 5%";
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 75) return "Top 25%";
  return "Building";
}

export function tierMicrocopy(tier: LeaderboardTier): string {
  switch (tier) {
    case "Top 1%":  return "Elite performance across all accounts";
    case "Top 5%":  return "Strong performance — Nova is highly optimized";
    case "Top 10%": return "Outperforming the vast majority of accounts";
    case "Top 25%": return "Outperforming most accounts — still improving";
    default:        return "Nova is still learning your environment";
  }
}

export async function getClientLeaderboardPosition(
  db: Db,
  userId: string
): Promise<LeaderboardEntry | null> {
  const snapshot = await db.collection("leaderboard").findOne({ key: "global" });
  if (!snapshot?.entries) return null;
  const entries = snapshot.entries as LeaderboardEntry[];
  return entries.find(e => e.userId === userId) ?? null;
}

export async function getLeaderboardSnapshot(db: Db): Promise<LeaderboardEntry[]> {
  const snapshot = await db.collection("leaderboard").findOne({ key: "global" });
  return (snapshot?.entries as LeaderboardEntry[]) ?? [];
}

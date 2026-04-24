/**
 * lib/system/selectChallengers.ts
 *
 * Pure function — selects the best challenger candidates for a given anomaly type.
 *
 * Picks from all known action types EXCEPT the current champion.
 * Ranks by historical evidence from getAnomalyActionPerformance() output.
 * Returns up to MAX_CHALLENGERS candidates, filtered to trusted actions.
 *
 * Used by POST /api/admin/anomaly-actions/challenger/start to seed
 * initial challenger set when an experiment is created.
 */

export const ALL_ACTION_TYPES = [
  'seed_jobs',
  'increase_throughput',
  'throttle_system',
  'force_publish',
  'inject_activity',
  'stabilize_system',
] as const;

export type ActionType = typeof ALL_ACTION_TYPES[number];

const MAX_CHALLENGERS = parseInt(process.env.MAX_CHALLENGERS ?? '2', 10);

export interface PerformanceRow {
  anomalyType:      string;
  actionType:       string;
  count:            number;
  avgEffectiveness: number;
  worsenedRate:     number;
  resolvedRate:     number;
}

export function selectChallengers(
  anomalyType:       string,
  championAction:    string,
  allPerformance:    PerformanceRow[],
): string[] {
  // Filter to rows for this anomaly type, excluding the current champion
  const candidates = allPerformance
    .filter(r =>
      r.anomalyType === anomalyType &&
      r.actionType  !== championAction &&
      r.worsenedRate <= 0.25   // never challenge with a known high-risk action
    )
    .sort((a, b) => b.avgEffectiveness - a.avgEffectiveness)
    .slice(0, MAX_CHALLENGERS)
    .map(r => r.actionType);

  // If we have fewer candidates than MAX_CHALLENGERS (sparse history),
  // fill with untested action types (they'll get evidence from shadow runs)
  if (candidates.length < MAX_CHALLENGERS) {
    const untested = ALL_ACTION_TYPES.filter(
      a => a !== championAction && !candidates.includes(a)
    );
    candidates.push(...untested.slice(0, MAX_CHALLENGERS - candidates.length));
  }

  return candidates.slice(0, MAX_CHALLENGERS);
}

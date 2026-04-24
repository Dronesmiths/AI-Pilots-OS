/**
 * lib/system/buildAnomalyActionLeaderboard.ts
 *
 * Rebuilds all leaderboard snapshots from current outcome evidence.
 * Reuses getAnomalyActionPerformance() (already built) — rates come back
 * as whole-number percentages so we divide by 100 for the tier function.
 *
 * Called by:
 *   - POST /api/mission-control/anomaly-action-performance (outcome sweep cron)
 *   - GET /api/admin/anomaly-actions/leaderboard (inline on first load if stale)
 *
 * Returns summary of tier distribution for cron log visibility.
 */

import connectToDatabase                          from '@/lib/mongodb';
import AnomalyActionLeaderboardSnapshot           from '@/models/AnomalyActionLeaderboardSnapshot';
import { getAnomalyActionPerformance }            from './getAnomalyActionPerformance';
import { getAnomalyActionTrustTier }              from './getAnomalyActionTrustTier';
import { getPolicyReviewRecommendation }          from './getPolicyReviewRecommendation';

export interface LeaderboardBuildResult {
  built:    number;
  tierDist: Record<string, number>;
}

export async function buildAnomalyActionLeaderboard(): Promise<LeaderboardBuildResult> {
  await connectToDatabase();

  // getAnomalyActionPerformance returns rates as whole-number % (e.g., 72)
  const rows = await getAnomalyActionPerformance();
  const tierDist: Record<string, number> = {};

  for (const row of rows) {
    // Normalize % → 0–1 for tier function
    const evidenceInput = {
      sampleCount:      row.count,
      avgEffectiveness: row.avgEffectiveness,
      improvedRate:     row.improvedRate  / 100,
      worsenedRate:     row.worsenedRate  / 100,
      resolvedRate:     row.resolvedRate  / 100,
    };

    const tier           = getAnomalyActionTrustTier(evidenceInput);
    const recommendation = getPolicyReviewRecommendation(evidenceInput);

    tierDist[tier.tier] = (tierDist[tier.tier] ?? 0) + 1;

    await AnomalyActionLeaderboardSnapshot.findOneAndUpdate(
      { anomalyType: row.anomalyType, actionType: row.actionType },
      {
        $set: {
          trustTier:      tier.tier,
          trustScore:     tier.score,
          evidence: {
            sampleCount:      row.count,
            avgEffectiveness: row.avgEffectiveness,
            improvedRate:     row.improvedRate  / 100,
            worsenedRate:     row.worsenedRate  / 100,
            resolvedRate:     row.resolvedRate  / 100,
          },
          recommendation: recommendation.recommendation,
          reason:         tier.reason,
        },
      },
      { upsert: true }
    );
  }

  return { built: rows.length, tierDist };
}

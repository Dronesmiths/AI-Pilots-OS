/**
 * lib/system/syncAnomalyActionPolicies.ts
 *
 * Reuses getAnomalyActionPerformance() aggregation (already built)
 * to sync fresh evidence into AnomalyActionPolicy docs.
 *
 * Also computes and stores the system recommendation per pair.
 * Existing operator decisions (mode, reviewStatus) are NOT overwritten
 * unless the policy is still in 'pending' state — once an operator has
 * reviewed it, their decision is preserved.
 *
 * Called by:
 *   - GET /api/admin/anomaly-actions/policies (inline on open)
 *   - POST /api/mission-control/anomaly-action-performance (outcome sweep cron)
 */

import connectToDatabase                 from '@/lib/mongodb';
import AnomalyActionPolicy               from '@/models/AnomalyActionPolicy';
import { getAnomalyActionPerformance }   from './getAnomalyActionPerformance';
import { getPolicyReviewRecommendation } from './getPolicyReviewRecommendation';

export async function syncAnomalyActionPolicies() {
  await connectToDatabase();
  const rows = await getAnomalyActionPerformance();

  for (const row of rows) {
    const { recommendation, reason } = getPolicyReviewRecommendation({
      sampleCount:      row.count,
      avgEffectiveness: row.avgEffectiveness,
      improvedRate:     row.improvedRate  / 100, // convert % back to 0–1
      worsenedRate:     row.worsenedRate  / 100,
      resolvedRate:     row.resolvedRate  / 100,
    });

    await AnomalyActionPolicy.findOneAndUpdate(
      { anomalyType: row.anomalyType, actionType: row.actionType },
      {
        $set: {
          // Always update evidence + recommendation (these are system-derived)
          evidence: {
            sampleCount:      row.count,
            avgEffectiveness: row.avgEffectiveness,
            improvedRate:     row.improvedRate  / 100,
            worsenedRate:     row.worsenedRate  / 100,
            resolvedRate:     row.resolvedRate  / 100,
          },
          recommendation,
          recommendationReason: reason,
        },
        // Only set mode/reviewStatus on first creation — don't override operator decisions
        $setOnInsert: {
          mode:         'recommend_only',
          reviewStatus: 'pending',
        },
      },
      { upsert: true, new: true }
    );
  }

  return rows.length;
}

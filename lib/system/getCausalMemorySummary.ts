/**
 * lib/system/getCausalMemorySummary.ts
 *
 * Aggregates causal memory records by (anomalyType, actionType, primaryReason).
 * Answers: "Under what conditions does each action work or fail?"
 *
 * Example output row:
 *   anomaly: stuck_cold
 *   action:  seed_jobs
 *   reason:  cold_start_bootstrap
 *   count:   11
 *   avgEff:  18.2
 *   improved: 0.82
 *
 * Sorted by: count desc, then avgEffectiveness desc.
 * Minimum 2 samples per group to avoid single-tenant noise.
 */

import connectToDatabase           from '@/lib/mongodb';
import AnomalyActionCausalMemory   from '@/models/AnomalyActionCausalMemory';

export interface CausalMemorySummaryRow {
  anomalyType:      string;
  actionType:       string;
  primaryReason:    string;
  count:            number;
  avgEffectiveness: number;
  improvedRate:     number;
  worsenedRate:     number;
  resolvedRate:     number;
}

const MIN_GROUP_SAMPLES = parseInt(process.env.CAUSAL_MIN_GROUP_SAMPLES ?? '2', 10);

export async function getCausalMemorySummary(): Promise<CausalMemorySummaryRow[]> {
  await connectToDatabase();

  const rows = await AnomalyActionCausalMemory.aggregate([
    {
      $group: {
        _id: {
          anomalyType:   '$anomalyType',
          actionType:    '$actionType',
          primaryReason: '$inferredCause.primaryReason',
        },
        count:            { $sum: 1 },
        avgEffectiveness: { $avg: '$outcome.effectivenessScore' },
        improvedRate:     { $avg: { $cond: ['$outcome.improved',       1, 0] } },
        worsenedRate:     { $avg: { $cond: ['$outcome.worsened',        1, 0] } },
        resolvedRate:     { $avg: { $cond: ['$outcome.anomalyResolved', 1, 0] } },
      },
    },
    { $match: { count: { $gte: MIN_GROUP_SAMPLES } } },
    { $sort: { count: -1, avgEffectiveness: -1 } },
  ]);

  return rows.map((r: any) => ({
    anomalyType:      r._id.anomalyType,
    actionType:       r._id.actionType,
    primaryReason:    r._id.primaryReason,
    count:            r.count,
    avgEffectiveness: Math.round(r.avgEffectiveness ?? 0),
    improvedRate:     Math.round((r.improvedRate  ?? 0) * 100),
    worsenedRate:     Math.round((r.worsenedRate  ?? 0) * 100),
    resolvedRate:     Math.round((r.resolvedRate  ?? 0) * 100),
  }));
}

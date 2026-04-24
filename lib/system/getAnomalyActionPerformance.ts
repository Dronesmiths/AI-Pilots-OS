/**
 * lib/system/getAnomalyActionPerformance.ts
 *
 * Aggregates TenantAnomalyActionOutcome to produce per (anomalyType, actionType)
 * performance stats. This is the learning signal.
 *
 * Returns sorted by avgEffectiveness desc — best-performing pairs at top.
 *
 * Used by:
 *   - AnomalyActionLearningPanel
 *   - getActionExecutionMode() to override autoExecutable
 *   - Future: action selection policy
 */

import connectToDatabase              from '@/lib/mongodb';
import TenantAnomalyActionOutcome    from '@/models/TenantAnomalyActionOutcome';
import { getActionExecutionMode }     from './getActionExecutionMode';

export interface ActionPerformanceRow {
  anomalyType:      string;
  actionType:       string;
  count:            number;
  avgEffectiveness: number;
  improvedRate:     number;
  worsenedRate:     number;
  resolvedRate:     number;
  executionMode:    string;
}

export async function getAnomalyActionPerformance(): Promise<ActionPerformanceRow[]> {
  await connectToDatabase();

  const rows = await TenantAnomalyActionOutcome.aggregate([
    {
      $group: {
        _id:              { anomalyType: '$anomalyType', actionType: '$actionType' },
        count:            { $sum: 1 },
        avgEffectiveness: { $avg: '$outcome.effectivenessScore' },
        improvedRate:     { $avg: { $cond: ['$outcome.improved',       1, 0] } },
        worsenedRate:     { $avg: { $cond: ['$outcome.worsened',       1, 0] } },
        resolvedRate:     { $avg: { $cond: ['$outcome.anomalyResolved', 1, 0] } },
      },
    },
    { $sort: { avgEffectiveness: -1 } },
  ]);

  return rows.map((r: any) => ({
    anomalyType:      r._id.anomalyType,
    actionType:       r._id.actionType,
    count:            r.count,
    avgEffectiveness: Math.round(r.avgEffectiveness ?? 0),
    improvedRate:     Math.round((r.improvedRate ?? 0) * 100),   // as %
    worsenedRate:     Math.round((r.worsenedRate ?? 0) * 100),   // as %
    resolvedRate:     Math.round((r.resolvedRate ?? 0) * 100),   // as %
    executionMode:    getActionExecutionMode({
      count:            r.count,
      avgEffectiveness: r.avgEffectiveness ?? 0,
    }),
  }));
}

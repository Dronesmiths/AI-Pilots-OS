/**
 * lib/system/runShadowAction.ts
 *
 * Shadow execution layer — simulates what an action WOULD DO without
 * mutating any live system state.
 *
 * SAFE CONTRACT: this function NEVER writes to seoactionjobs, tenant_settings,
 * or any collection that affects live tenant behavior.
 *
 * How the simulation works:
 *   1. Look up historical outcome averages for this (anomalyType, actionType)
 *      pair from TenantAnomalyActionOutcome
 *   2. Apply confidence decay for small sample sizes (< 5 → highly uncertain)
 *   3. Add small noise to prevent the simulation from converging to identical
 *      scores across all tenants
 *   4. Return a ShadowOutcome — same shape as a real action result
 *
 * This is NOT random. It uses real measured data where available.
 * For untested pairs, it returns conservative estimates that flag
 * themselves as low-confidence.
 */

import connectToDatabase           from '@/lib/mongodb';
import TenantAnomalyActionOutcome  from '@/models/TenantAnomalyActionOutcome';

export interface ShadowOutcome {
  simulatedEffectiveness: number;
  improved:               boolean;
  worsened:               boolean;
  resolved:               boolean;
  confidence:             'high' | 'medium' | 'low'; // data quality signal
  sampleBasis:            number; // how many real outcomes this is based on
}

export async function runShadowAction({
  anomalyType,
  actionType,
}: {
  tenantId:    string; // kept in signature for future tenant-specific sim
  anomalyType: string;
  actionType:  string;
}): Promise<ShadowOutcome> {
  await connectToDatabase();

  // ── 1. Look up historical performance for this pair ───────────────────────
  const outcomes = await TenantAnomalyActionOutcome.aggregate([
    { $match: { anomalyType, actionType } },
    {
      $group: {
        _id:              null,
        count:            { $sum: 1 },
        avgEffectiveness: { $avg: '$outcome.effectivenessScore' },
        resolvedRate:     { $avg: { $cond: ['$outcome.anomalyResolved', 1, 0] } },
        improvedRate:     { $avg: { $cond: ['$outcome.improved',        1, 0] } },
        worsenedRate:     { $avg: { $cond: ['$outcome.worsened',        1, 0] } },
      },
    },
  ]);

  const hist = outcomes[0];

  if (!hist || hist.count < 2) {
    // No/insufficient data — return a conservative neutral estimate
    return {
      simulatedEffectiveness: 0,
      improved:               false,
      worsened:               false,
      resolved:               false,
      confidence:             'low',
      sampleBasis:            hist?.count ?? 0,
    };
  }

  // ── 2. Apply confidence decay for small samples ────────────────────────────
  // With 2–4 samples, temper the estimate toward neutral
  const sampleWeight = Math.min(hist.count / 8, 1); // 0→0 .. 8+→1
  const temperedEff  = hist.avgEffectiveness * sampleWeight;

  // ── 3. Add small calibrated noise (prevents identical scores fleet-wide) ───
  const noise = (Math.random() - 0.5) * 4; // ±2 points

  const simulatedEffectiveness = Math.round(temperedEff + noise);
  const improved = simulatedEffectiveness > 10;
  const worsened = simulatedEffectiveness < -10;
  const resolved = hist.resolvedRate >= 0.5;

  return {
    simulatedEffectiveness,
    improved,
    worsened,
    resolved,
    confidence:  hist.count >= 8 ? 'high' : hist.count >= 4 ? 'medium' : 'low',
    sampleBasis: hist.count,
  };
}

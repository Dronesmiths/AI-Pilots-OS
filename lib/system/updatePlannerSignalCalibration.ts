/**
 * lib/system/updatePlannerSignalCalibration.ts
 *
 * Updates (or creates) the calibration record for a given scope.
 * Called after each PlannerFeedbackEvent is written.
 *
 * Weight update logic:
 *   reward = signal about outcome quality (+0.12 to -0.16)
 *   applied only to the winningSource's weight
 *   clamped to [0.25, 3.0] to prevent extreme drift
 *
 * Counterfactual loss applies a small penalty to ALL source weights
 * because the planner chose wrong regardless of which source led it there.
 *
 * Running averages use the stored sampleCount as the denominator
 * (equivalent to online Welford mean update).
 */
import connectToDatabase        from '@/lib/mongodb';
import PlannerSignalCalibration from '@/models/PlannerSignalCalibration';
import type { RecommendationQuality } from './evaluatePlannerOutcome';

type WinningSource = 'graph' | 'causal_memory' | 'leaderboard' | 'policy_bias' | 'hybrid';

function clamp(v: number): number {
  return Math.max(0.25, Math.min(3.0, parseFloat(v.toFixed(4))));
}

function runningAvg(currentAvg: number, n: number, newValue: number): number {
  return ((currentAvg * (n - 1)) + newValue) / n;
}

const QUALITY_REWARD: Record<RecommendationQuality, number> = {
  strong_hit:  +0.12,
  partial_hit: +0.07,
  weak_hit:    +0.02,
  miss:        -0.08,
  harmful:     -0.16,
};

export async function updatePlannerSignalCalibration(input: {
  anomalyType:                string;
  lifecycleStage:             string;
  trustTier:                  string;
  policyMode:                 string;
  winningSource:              WinningSource;
  outcomeScoreDelta:          number;
  recommendationQuality:      RecommendationQuality;
  counterfactualBeatPlanner:  boolean;
  confidenceCalibrationDelta: number;
}): Promise<void> {
  await connectToDatabase();

  const scopeKey = [input.anomalyType, input.lifecycleStage, input.trustTier, input.policyMode].join('::');

  // Upsert the calibration doc
  let doc = await PlannerSignalCalibration.findOne({ scopeKey }) as any;
  if (!doc) {
    doc = await PlannerSignalCalibration.create({
      scopeKey,
      anomalyType:    input.anomalyType,
      lifecycleStage: input.lifecycleStage,
      trustTier:      input.trustTier,
      policyMode:     input.policyMode,
    });
  }

  doc.sampleCount += 1;
  const n = doc.sampleCount;

  // ── Running averages ─────────────────────────────────────────────────────
  doc.avgOutcomeDelta            = runningAvg(doc.avgOutcomeDelta,            n, input.outcomeScoreDelta);
  doc.confidenceCalibrationError = runningAvg(doc.confidenceCalibrationError, n, Math.abs(input.confidenceCalibrationDelta));

  const hit     = ['strong_hit', 'partial_hit'].includes(input.recommendationQuality) ? 1 : 0;
  const harm    = input.recommendationQuality === 'harmful' ? 1 : 0;
  const cfLoss  = input.counterfactualBeatPlanner ? 1 : 0;

  doc.plannerHitRate         = runningAvg(doc.plannerHitRate,         n, hit);
  doc.plannerHarmRate        = runningAvg(doc.plannerHarmRate,        n, harm);
  doc.counterfactualLossRate = runningAvg(doc.counterfactualLossRate, n, cfLoss);

  // ── Source weight update ──────────────────────────────────────────────────
  const reward = QUALITY_REWARD[input.recommendationQuality] ?? 0;
  const src    = input.winningSource;

  if (src === 'graph'         || src === 'hybrid') doc.graphWeight        = clamp(doc.graphWeight        + reward);
  if (src === 'causal_memory' || src === 'hybrid') doc.causalMemoryWeight = clamp(doc.causalMemoryWeight + reward);
  if (src === 'leaderboard'   || src === 'hybrid') doc.leaderboardWeight  = clamp(doc.leaderboardWeight  + reward);
  if (src === 'policy_bias'   || src === 'hybrid') doc.policyBiasWeight   = clamp(doc.policyBiasWeight   + reward * 0.5); // policy bias gets half reward

  // Counterfactual loss: small penalty to all weights (chose wrong regardless of source)
  if (input.counterfactualBeatPlanner) {
    doc.graphWeight        = clamp(doc.graphWeight        - 0.04);
    doc.causalMemoryWeight = clamp(doc.causalMemoryWeight - 0.04);
    doc.leaderboardWeight  = clamp(doc.leaderboardWeight  - 0.04);
  }

  await doc.save();
}

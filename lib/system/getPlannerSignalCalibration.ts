/**
 * lib/system/getPlannerSignalCalibration.ts
 *
 * Fetches the learned signal calibration weights for a given scope:
 *   (anomalyType × lifecycleStage × trustTier × policyMode)
 *
 * Returns neutral weights (all 1.0) when no calibration record exists yet
 * (cold start) — score multiplications are identity, no effect on ranking.
 *
 * Weights are applied in buildInterventionPlan after adjustedScore is computed.
 */
import connectToDatabase         from '@/lib/mongodb';
import PlannerSignalCalibration  from '@/models/PlannerSignalCalibration';

export interface SignalCalibrationWeights {
  graphWeight:        number;
  causalMemoryWeight: number;
  leaderboardWeight:  number;
  policyBiasWeight:   number;
  sampleCount:        number;
}

const NEUTRAL_WEIGHTS: SignalCalibrationWeights = {
  graphWeight:        1.0,
  causalMemoryWeight: 1.0,
  leaderboardWeight:  1.0,
  policyBiasWeight:   1.0,
  sampleCount:        0,
};

const MIN_SAMPLES_TO_APPLY = parseInt(process.env.PLANNER_CALIB_MIN_SAMPLES ?? '3', 10);

export async function getPlannerSignalCalibration(input: {
  anomalyType:    string;
  lifecycleStage: string;
  trustTier:      string;
  policyMode:     string;
}): Promise<SignalCalibrationWeights> {
  await connectToDatabase();

  const scopeKey = [input.anomalyType, input.lifecycleStage, input.trustTier, input.policyMode].join('::');
  const doc = await PlannerSignalCalibration.findOne({ scopeKey }).lean() as any;

  if (!doc || (doc.sampleCount ?? 0) < MIN_SAMPLES_TO_APPLY) {
    // Insufficient samples — return neutral to avoid premature drift
    return NEUTRAL_WEIGHTS;
  }

  return {
    graphWeight:        doc.graphWeight        ?? 1.0,
    causalMemoryWeight: doc.causalMemoryWeight ?? 1.0,
    leaderboardWeight:  doc.leaderboardWeight  ?? 1.0,
    policyBiasWeight:   doc.policyBiasWeight   ?? 1.0,
    sampleCount:        doc.sampleCount        ?? 0,
  };
}

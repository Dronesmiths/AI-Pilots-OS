/**
 * lib/system/getPlannerConfidenceCalibration.ts
 *
 * Fetches the confidence calibration for a scope.
 * Returns neutral calibration (all zeroes) when no data exists yet.
 *
 * MIN_SAMPLES guard: requires at least one sample in at least one tier
 * before returning real calibration data — prevents premature drift
 * from a single observation.
 */
import connectToDatabase             from '@/lib/mongodb';
import PlannerConfidenceCalibration  from '@/models/PlannerConfidenceCalibration';

export interface ConfidenceCalibration {
  overconfidenceScore:  number;
  underconfidenceScore: number;
  calibrationError:     number;
  totalSamples:         number;
}

const NEUTRAL: ConfidenceCalibration = {
  overconfidenceScore:  0,
  underconfidenceScore: 0,
  calibrationError:     0,
  totalSamples:         0,
};

export async function getPlannerConfidenceCalibration(input: {
  anomalyType:    string;
  lifecycleStage: string;
  trustTier:      string;
  policyMode:     string;
}): Promise<ConfidenceCalibration> {
  await connectToDatabase();

  const scopeKey = [input.anomalyType, input.lifecycleStage, input.trustTier, input.policyMode].join('::');
  const doc = await PlannerConfidenceCalibration.findOne({ scopeKey }).lean() as any;

  if (!doc) return NEUTRAL;

  const totalSamples = (doc.highSampleCount ?? 0) + (doc.mediumSampleCount ?? 0) + (doc.lowSampleCount ?? 0);
  if (totalSamples < 1) return NEUTRAL;

  return {
    overconfidenceScore:  doc.overconfidenceScore  ?? 0,
    underconfidenceScore: doc.underconfidenceScore ?? 0,
    calibrationError:     doc.calibrationError     ?? 0,
    totalSamples,
  };
}

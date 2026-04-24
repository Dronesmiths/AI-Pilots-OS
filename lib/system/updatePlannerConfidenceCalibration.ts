/**
 * lib/system/updatePlannerConfidenceCalibration.ts
 *
 * Updates (or creates) the confidence calibration record for a given scope
 * after each planner feedback event. Called from runPlannerFeedbackLoop.
 *
 * Maps outcomeLabel to a binary observed success value:
 *   improved         → 1.0
 *   neutral          → 0.5
 *   worsened         → 0.0
 *   failed_execution → 0.0 (execution error = no success)
 *   aborted          → 0.5 (neutral — no outcome measured)
 *
 * Derived scores are recomputed each update:
 *   overconfidenceScore  = sum max(0, expected - actual) per tier
 *   underconfidenceScore = sum max(0, actual - expected) per tier
 *   calibrationError     = mean |expected - actual| across active tiers
 */
import connectToDatabase               from '@/lib/mongodb';
import PlannerConfidenceCalibration    from '@/models/PlannerConfidenceCalibration';

type OutcomeLabel = 'improved' | 'neutral' | 'worsened' | 'failed_execution' | 'aborted';

function toObserved(outcomeLabel: OutcomeLabel): number {
  if (outcomeLabel === 'improved')         return 1.0;
  if (outcomeLabel === 'neutral')          return 0.5;
  if (outcomeLabel === 'aborted')          return 0.5;
  return 0.0; // worsened, failed_execution
}

function runningAvg(current: number, n: number, value: number): number {
  return ((current * (n - 1)) + value) / n;
}

export async function updatePlannerConfidenceCalibration(input: {
  anomalyType:    string;
  lifecycleStage: string;
  trustTier:      string;
  policyMode:     string;
  confidence:     'low' | 'medium' | 'high';
  outcomeLabel:   OutcomeLabel;
}): Promise<void> {
  await connectToDatabase();

  const scopeKey = [input.anomalyType, input.lifecycleStage, input.trustTier, input.policyMode].join('::');
  let doc = await PlannerConfidenceCalibration.findOne({ scopeKey }) as any;
  if (!doc) {
    doc = await PlannerConfidenceCalibration.create({
      scopeKey,
      anomalyType:    input.anomalyType,
      lifecycleStage: input.lifecycleStage,
      trustTier:      input.trustTier,
      policyMode:     input.policyMode,
    });
  }

  const observed = toObserved(input.outcomeLabel);

  // Update the relevant tier
  if (input.confidence === 'high') {
    doc.highSampleCount  += 1;
    const n = doc.highSampleCount;
    doc.highConfidenceActual = runningAvg(doc.highConfidenceActual, n, observed);
  } else if (input.confidence === 'medium') {
    doc.mediumSampleCount += 1;
    const n = doc.mediumSampleCount;
    doc.mediumConfidenceActual = runningAvg(doc.mediumConfidenceActual, n, observed);
  } else {
    doc.lowSampleCount  += 1;
    const n = doc.lowSampleCount;
    doc.lowConfidenceActual = runningAvg(doc.lowConfidenceActual, n, observed);
  }

  // Recompute derived scores
  const highError   = doc.highConfidenceActual   - doc.highConfidenceExpected;
  const medError    = doc.mediumConfidenceActual  - doc.mediumConfidenceExpected;
  const lowError    = doc.lowConfidenceActual     - doc.lowConfidenceExpected;

  doc.overconfidenceScore  = Math.max(0, -highError) + Math.max(0, -medError) + Math.max(0, -lowError);
  doc.underconfidenceScore = Math.max(0, highError)  + Math.max(0, medError)  + Math.max(0, lowError);

  // Only include tiers with samples in calibration error
  const activeTierErrors: number[] = [];
  if (doc.highSampleCount   > 0) activeTierErrors.push(Math.abs(highError));
  if (doc.mediumSampleCount > 0) activeTierErrors.push(Math.abs(medError));
  if (doc.lowSampleCount    > 0) activeTierErrors.push(Math.abs(lowError));

  doc.calibrationError = activeTierErrors.length > 0
    ? activeTierErrors.reduce((a, b) => a + b, 0) / activeTierErrors.length
    : 0;

  await doc.save();
}

/**
 * lib/system/evaluatePlannerOutcome.ts
 *
 * Pure function — scores the quality of a planner decision given the
 * observed health delta and anomaly resolution status.
 *
 * Confidence calibration:
 *   expected = what % success the confidence level predicts
 *   observed = binary success signal (improved=1, neutral=0.5, worsened=0)
 *   delta    = (observed - expected) × 100  (positive = overconfident)
 *
 * Quality tiers:
 *   strong_hit   improved AND delta >= 20
 *   partial_hit  improved AND delta < 20
 *   weak_hit     neutral outcome
 *   miss         worsened but mild
 *   harmful      worsened AND delta <= -25, or failed execution
 */

export type OutcomeLabel         = 'improved' | 'neutral' | 'worsened' | 'failed_execution' | 'aborted';
export type RecommendationQuality = 'strong_hit' | 'partial_hit' | 'weak_hit' | 'miss' | 'harmful';

export interface PlannerOutcome {
  outcomeLabel:               OutcomeLabel;
  outcomeScoreDelta:          number;
  recommendationQuality:      RecommendationQuality;
  confidenceCalibrationDelta: number;
}

const CONFIDENCE_EXPECTATION: Record<string, number> = {
  high:   0.85,
  medium: 0.60,
  low:    0.35,
};

export function evaluatePlannerOutcome(input: {
  beforeHealthScore:   number;
  afterHealthScore:    number;
  anomalyResolved:     boolean;
  executionSucceeded:  boolean;
  confidence:          'low' | 'medium' | 'high';
}): PlannerOutcome {
  if (!input.executionSucceeded) {
    return {
      outcomeLabel:               'failed_execution',
      outcomeScoreDelta:          -30,
      recommendationQuality:      'harmful',
      confidenceCalibrationDelta: -50,  // strong penalty: confident plan failed to execute
    };
  }

  const delta = Math.round(input.afterHealthScore - input.beforeHealthScore);

  let outcomeLabel: OutcomeLabel;
  if (delta >= 15 || input.anomalyResolved)  outcomeLabel = 'improved';
  else if (delta <= -10)                      outcomeLabel = 'worsened';
  else                                        outcomeLabel = 'neutral';

  let recommendationQuality: RecommendationQuality;
  if      (outcomeLabel === 'improved' && delta >= 20) recommendationQuality = 'strong_hit';
  else if (outcomeLabel === 'improved')                recommendationQuality = 'partial_hit';
  else if (outcomeLabel === 'neutral')                 recommendationQuality = 'weak_hit';
  else if (outcomeLabel === 'worsened' && delta > -25) recommendationQuality = 'miss';
  else                                                 recommendationQuality = 'harmful';

  const expected = CONFIDENCE_EXPECTATION[input.confidence] ?? 0.50;
  const observed = outcomeLabel === 'improved' ? 1.0 : outcomeLabel === 'neutral' ? 0.5 : 0.0;

  // Positive = under-confident (more happened than predicted)
  // Negative = over-confident (less happened than predicted)
  const confidenceCalibrationDelta = Math.round((observed - expected) * 100);

  return { outcomeLabel, outcomeScoreDelta: delta, recommendationQuality, confidenceCalibrationDelta };
}

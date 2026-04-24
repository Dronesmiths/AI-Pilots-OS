/**
 * lib/system/computeExplorationPressure.ts
 *
 * Pure function — computes exploration and exploitation pressure scores
 * from scope learning state, calibration, and risk inputs.
 *
 * Exploration pressure rises when:
 *   - scope has few samples (high uncertainty)
 *   - calibration error is high (confidence labels unreliable)
 *   - counterfactual losses suggest runner-up might win
 *   - planner harm rate is significant
 *   - score gap between champion and runner-up is small
 *   - uncertainty level is high
 *
 * Exploitation pressure rises when:
 *   - planner hit rate is strong
 *   - enough samples exist
 *   - score gap is wide (champion clearly dominates)
 *   - anomaly is inherently risky (safe to use proven action)
 *   - champion lock confidence is high
 *
 * Returns raw integer scores — caller decides threshold to switch modes.
 */

export interface ExplorationPressureResult {
  explorationPressure:  number;
  exploitationPressure: number;
}

export function computeExplorationPressure(input: {
  sampleCount:            number;
  plannerHitRate:         number;
  plannerHarmRate:        number;
  counterfactualLossRate: number;
  calibrationError:       number;
  scoreGap:               number;
  uncertaintyLevel:       'low' | 'medium' | 'high';
  anomalyRisk:            number;  // 0..1
  championLockConfidence: number;  // 0..1
}): ExplorationPressureResult {
  let explore = 0;
  let exploit = 0;

  // Sample scarcity → explore
  if      (input.sampleCount < 5)  explore += 30;
  else if (input.sampleCount < 12) explore += 18;
  else                             exploit += 10;

  // Calibration weakness → explore
  explore += input.calibrationError * 40;

  // Counterfactual misses → explore
  explore += input.counterfactualLossRate * 30;

  // Planner quality
  exploit += input.plannerHitRate  * 35;
  explore += input.plannerHarmRate * 40;

  // Score gap (tight gap → explore, wide gap → exploit)
  if      (input.scoreGap <= 5)  explore += 20;
  else if (input.scoreGap <= 12) explore += 10;
  else                           exploit += 18;

  // Uncertainty level
  if (input.uncertaintyLevel === 'high')   explore += 20;
  if (input.uncertaintyLevel === 'medium') explore += 10;
  if (input.uncertaintyLevel === 'low')    exploit += 8;

  // Anomaly risk: risky anomaly dampens live exploration (use proven action)
  explore -= input.anomalyRisk * 25;
  exploit += input.anomalyRisk * 10;

  // Champion lock confidence
  exploit += input.championLockConfidence * 30;

  return {
    explorationPressure:  Math.round(explore),
    exploitationPressure: Math.round(exploit),
  };
}

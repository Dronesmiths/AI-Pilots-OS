/**
 * lib/system/scoreGraphInterventionPath.ts
 *
 * Pure function — scores a complete intervention path:
 *   anomaly → context → action → outcome → reason
 *
 * Score components (approximate 0–100 range):
 *   contextMatch          × 0.25   (0–100 from scoreCausalContextMatch)
 *   anomalyToContextWeight × 0.10  (edge traversal count, capped for scoring)
 *   contextToActionWeight  × 0.15
 *   actionToOutcomeWeight  × 0.15
 *   outcomeToReasonWeight  × 0.05
 *   actionAvgEffectiveness × 0.20  (raw, can be negative)
 *   actionSuccessRate      × 20    (0.0–1.0 → 0–20 pts)
 *   actionWorsenedRate     × -25   (penalty: worse than poor effectiveness)
 *   outcomeLabel bonus/penalty:    +10 'improved', -20 'worsened'
 *
 * Weights calibrated so:
 *   - context match is the strongest single signal (25%)
 *   - worsened penalty dominates a weak positive effectiveness score
 *   - edge weight rewards paths with more evidence
 */

export interface PathScoreInput {
  contextMatch:           number;  // 0–100
  anomalyToContextWeight: number;  // traversal count
  contextToActionWeight:  number;
  actionToOutcomeWeight:  number;
  outcomeToReasonWeight:  number;
  actionAvgEffectiveness: number;  // can be negative
  actionSuccessRate:      number;  // 0.0–1.0
  actionWorsenedRate:     number;  // 0.0–1.0
  outcomeLabel:           string;  // 'improved' | 'worsened' | 'neutral'
}

export function scoreGraphInterventionPath(input: PathScoreInput): number {
  let score = 0;

  score += input.contextMatch           * 0.25;
  score += input.anomalyToContextWeight * 0.10;
  score += input.contextToActionWeight  * 0.15;
  score += input.actionToOutcomeWeight  * 0.15;
  score += input.outcomeToReasonWeight  * 0.05;

  score += input.actionAvgEffectiveness * 0.20;
  score += input.actionSuccessRate      * 20;
  score -= input.actionWorsenedRate     * 25;

  if (input.outcomeLabel === 'improved') score += 10;
  if (input.outcomeLabel === 'worsened') score -= 20;

  return Math.round(score);
}

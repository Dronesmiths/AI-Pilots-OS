/**
 * lib/system/evaluateGraphPolicyPromotion.ts
 *
 * Pure function — scores a graph pattern against promotion thresholds.
 *
 * Score components:
 *   +20 / +10  support count (≥20 / ≥10 observations)
 *   +0.8×      avg outcome delta
 *   +20×       avg confidence
 *   +25×       stability score (0..1)
 *   +3×        family spread (capped at 10 distinct families)
 *   -40×       harm rate
 *   +8         bonus for action_penalty with harm > 0.15 (penalizing harm is good)
 *
 * Verdicts:
 *   score ≥ 45 → approved (shadow rollout begins)
 *   score ≥ 28 → approval_required
 *   score < 28 → rejected
 */

export type PolicyPromotionVerdict = 'approved' | 'approval_required' | 'rejected';
export type PolicyType = 'action_boost' | 'action_penalty' | 'exploration_shift' | 'reopen_threshold_shift' | 'inheritance_threshold_shift';
export type RolloutMode = 'shadow' | 'limited' | 'active';

export interface PolicyPromotionResult {
  verdict:       PolicyPromotionVerdict;
  rolloutMode:   RolloutMode;
  promotionScore:number;
  rationale:     string;
}

export function evaluateGraphPolicyPromotion(input: {
  supportCount:    number;
  avgOutcomeDelta: number;
  avgConfidence:   number;     // 0..1
  stabilityScore:  number;     // 0..1
  harmRate:        number;     // 0..1
  familySpread:    number;     // distinct scope families observed
  policyType:      PolicyType;
}): PolicyPromotionResult {
  let score = 0;

  if (input.supportCount >= 20) score += 20;
  else if (input.supportCount >= 10) score += 10;

  score += Math.max(0, input.avgOutcomeDelta) * 0.8;
  score += input.avgConfidence   * 20;
  score += input.stabilityScore  * 25;
  score += Math.min(input.familySpread, 10) * 3;
  score -= input.harmRate        * 40;

  // Bonus: actively penalizing harm is good governance even if score is borderline
  if (input.policyType === 'action_penalty' && input.harmRate > 0.15) score += 8;

  if (score >= 45) return {
    verdict:        'approved',
    rolloutMode:    'shadow',  // always starts in shadow regardless of score
    promotionScore: parseFloat(score.toFixed(2)),
    rationale:      `Pattern sufficiently stable (${score.toFixed(0)}pt) — shadow rollout authorized`,
  };

  if (score >= 28) return {
    verdict:        'approval_required',
    rolloutMode:    'shadow',
    promotionScore: parseFloat(score.toFixed(2)),
    rationale:      `Pattern promising (${score.toFixed(0)}pt) — operator review required before promotion`,
  };

  return {
    verdict:        'rejected',
    rolloutMode:    'shadow',
    promotionScore: parseFloat(score.toFixed(2)),
    rationale:      `Pattern support too weak or risky for promotion (${score.toFixed(0)}pt)`,
  };
}

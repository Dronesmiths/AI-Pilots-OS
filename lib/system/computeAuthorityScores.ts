/**
 * lib/system/computeAuthorityScores.ts
 *
 * Pure function — computes normalized authority scores (0..100) for each
 * decision source in a potential conflict.
 *
 * Score components:
 *   planner:  adjustedScore×0.40 + confidence bonus (high:+30, med:+20, low:+10)
 *             × (1 - calibrationError) to penalize unreliable planners
 *   policy:   ruleWeight×0.60 + rollout mode bonus (active:+30, limited:+20, shadow:+5)
 *             × (1 - calibrationError)
 *   champion: successRate×50 + lockConfidence×40   (empirical, not calibration-penalized)
 *   operator: fixed 100 (always highest base authority — never zero)
 *
 * Scores are NOT normalized — operator always wins a forced action.
 * Comparison between planner/policy/champion determines fallback priority.
 */

export interface AuthorityScores {
  planner:  number;
  policy:   number;
  champion: number;
  operator: number;
}

export function computeAuthorityScores(input: {
  planner: {
    adjustedScore: number;      // 0..100 from buildInterventionPlan
    confidence:    string;      // 'high' | 'medium' | 'low'
  };
  policy?: {
    ruleWeight:  number;        // 0..100 (rule's composite value)
    rolloutMode: string;        // 'shadow' | 'limited' | 'active'
  } | null;
  champion?: {
    successRate:    number;     // 0..1
    lockConfidence: number;     // 0..1
  } | null;
  calibrationError: number;     // 0..1 from PlannerConfidenceCalibration
}): AuthorityScores {
  const calibrationPenalty = Math.max(0, Math.min(1, input.calibrationError));

  // Planner score
  const confBonus = input.planner.confidence === 'high' ? 30 : input.planner.confidence === 'medium' ? 20 : 10;
  const plannerRaw = (input.planner.adjustedScore * 0.40) + confBonus;
  const planner = plannerRaw * (1 - calibrationPenalty);

  // Policy score
  let policy = 0;
  if (input.policy) {
    const modeBonus = input.policy.rolloutMode === 'active' ? 30 : input.policy.rolloutMode === 'limited' ? 20 : 5;
    const policyRaw = (input.policy.ruleWeight * 0.60) + modeBonus;
    policy = policyRaw * (1 - calibrationPenalty);
  }

  // Champion score — empirical evidence, not calibration-penalized
  let champion = 0;
  if (input.champion) {
    champion = (input.champion.successRate * 50) + (input.champion.lockConfidence * 40);
  }

  // Operator always wins a forced override — fixed 100
  const operator = 100;

  return {
    planner:  parseFloat(planner.toFixed(2)),
    policy:   parseFloat(policy.toFixed(2)),
    champion: parseFloat(champion.toFixed(2)),
    operator,
  };
}

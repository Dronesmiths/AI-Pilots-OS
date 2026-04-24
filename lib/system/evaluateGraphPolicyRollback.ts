/**
 * lib/system/evaluateGraphPolicyRollback.ts
 *
 * Pure function — determines whether a policy rule should be rolled back.
 *
 * Triggered when:
 *   sampleCount ≥ 8 AND hitRate < 0.45     (+18)
 *   harmRate > 0.20                          (+30)
 *   avgDelta < 0                             (+20)
 *
 * Plus the running rollbackScore (accumulated from prior evaluations).
 * shouldRollback when combined score ≥ 35.
 *
 * rollbackScore returned here should be persisted back to rule.performance.rollbackScore
 * so it accumulates across evaluation cycles.
 */

export interface RollbackResult {
  rollbackScore:   number;
  shouldRollback:  boolean;
  dominant:        string;   // which rollback signal is driving the score
  rationale:       string;
}

export function evaluateGraphPolicyRollback(input: {
  sampleCount:   number;
  hitRate:       number;
  harmRate:      number;
  avgDelta:      number;
  rollbackScore: number;   // prior accumulated score
}): RollbackResult {
  let score = input.rollbackScore;

  const hitRateFail = input.sampleCount >= 8 && input.hitRate < 0.45;
  const harmSpike   = input.harmRate > 0.20;
  const negativeDelta = input.avgDelta < 0;

  const hitAdd  = hitRateFail    ? 18 : 0;
  const harmAdd = harmSpike      ? 30 : 0;
  const deltaAdd= negativeDelta  ? 20 : 0;

  score += hitAdd + harmAdd + deltaAdd;

  const components = { hitRateFail: hitAdd, harmSpike: harmAdd, negativeDelta: deltaAdd };
  const dominant = Object.entries(components).filter(([,v]) => v > 0).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';

  const shouldRollback = score >= 35;

  return {
    rollbackScore: parseFloat(score.toFixed(2)),
    shouldRollback,
    dominant,
    rationale: shouldRollback
      ? `Policy crossed rollback threshold (${score.toFixed(0)}pt) — dominant signal: ${dominant}`
      : `Policy within acceptable bounds (${score.toFixed(0)}pt)`,
  };
}

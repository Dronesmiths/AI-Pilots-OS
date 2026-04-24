/**
 * lib/system/compareChampionVsChallenger.ts
 *
 * Pure function — compares challenger performance against the current champion.
 * Returns a verdict and the underlying delta.
 *
 * Comparison uses both effectiveness AND downside risk:
 *   - Challenger must score better on effectiveness
 *   - Challenger must have equal or lower worsened rate
 *   - Challenger must meet minimum sample threshold to avoid premature promotion
 *
 * Verdict types:
 *   outperforming    → challenger is significantly better (promotable)
 *   competitive      → challenger is better but not significantly
 *   equivalent       → within noise threshold
 *   underperforming  → challenger is worse
 */

const SIGNIFICANT_DELTA     = parseFloat(process.env.CHALLENGER_SIGNIFICANT_DELTA     ?? '8');
const COMPETITIVE_DELTA     = parseFloat(process.env.CHALLENGER_COMPETITIVE_DELTA     ?? '3');
const MIN_SAMPLES_TO_COMPARE = parseInt(process.env.CHALLENGER_MIN_SAMPLES            ?? '8', 10);

export type ChallengerVerdict = 'outperforming' | 'competitive' | 'equivalent' | 'underperforming';

export interface ComparisonResult {
  verdict:             ChallengerVerdict;
  effectivenessDelta:  number;
  riskDelta:           number;  // champion.worsenedRate - challenger.worsenedRate (positive = challenger safer)
  promotable:          boolean;
  reason:              string;
}

export interface PerformanceBrief {
  avgEffectiveness: number;
  worsenedRate:     number;
  resolvedRate:     number;
  sampleCount:      number;
}

export function compareChampionVsChallenger(
  champion:   PerformanceBrief,
  challenger: PerformanceBrief,
): ComparisonResult {
  if (challenger.sampleCount < MIN_SAMPLES_TO_COMPARE) {
    return {
      verdict:            'equivalent',
      effectivenessDelta: 0,
      riskDelta:          0,
      promotable:         false,
      reason:             `Challenger needs ${MIN_SAMPLES_TO_COMPARE} samples (has ${challenger.sampleCount})`,
    };
  }

  const effectivenessDelta = challenger.avgEffectiveness - champion.avgEffectiveness;
  const riskDelta          = champion.worsenedRate       - challenger.worsenedRate; // positive = challenger safer

  const saferOrEqual = challenger.worsenedRate <= champion.worsenedRate;

  let verdict:  ChallengerVerdict;
  let promotable = false;
  let reason: string;

  if (effectivenessDelta >= SIGNIFICANT_DELTA && saferOrEqual) {
    verdict   = 'outperforming';
    promotable = true;
    reason    = `+${effectivenessDelta.toFixed(1)} effectiveness, ${saferOrEqual ? 'safer risk' : 'same risk'}`;
  } else if (effectivenessDelta >= COMPETITIVE_DELTA && saferOrEqual) {
    verdict = 'competitive';
    reason  = `+${effectivenessDelta.toFixed(1)} effectiveness — promising but not promotable yet`;
  } else if (effectivenessDelta > -COMPETITIVE_DELTA) {
    verdict = 'equivalent';
    reason  = 'Within noise threshold — no clear winner';
  } else {
    verdict = 'underperforming';
    reason  = `${effectivenessDelta.toFixed(1)} effectiveness vs champion — not competitive`;
  }

  return { verdict, effectivenessDelta, riskDelta, promotable, reason };
}

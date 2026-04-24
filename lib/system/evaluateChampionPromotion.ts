/**
 * lib/system/evaluateChampionPromotion.ts
 *
 * Pure function — evaluates whether a challenger should replace the current champion.
 *
 * Score components (weighted sum):
 *   +40× deltaWinRate (recent win rate advantage)
 *   +0.8× deltaOutcome (health delta advantage)
 *   +30× deltaHarm (harm rate advantage for challenger)
 *   +20× shadowWinRate (shadow testing validation)
 *   +25× counterfactualWinRate (counterfactual evidence)
 *   +20× champion.decayScore (champion is weakening)
 *   +15× driftScore (environment changed, favors challenger)
 *   +15× confidence calibration fit delta
 *   +10× trust compatibility delta
 *
 * Verdicts:
 *   score ≥ 35 → approve          (strong evidence)
 *   score ≥ 20 → shadow_first     (promising but needs more proof)
 *   score ≥ 10 → approval_required (plausible, human decides)
 *   score < 10  → reject
 *
 * Minimum challenger sample count: 5 (configurable via ENV).
 */

export type PromotionVerdict = 'approve' | 'shadow_first' | 'approval_required' | 'reject';

export interface PromotionResult {
  verdict:            PromotionVerdict;
  decisionConfidence: number;  // 0..1
  rationale:          string;
  score:              number;
  evidence: {
    deltaWinRate:  number;
    deltaOutcome:  number;
    deltaHarmRate: number;
  };
}

const MIN_CHALLENGER_SAMPLES = parseInt(process.env.MIN_CHALLENGER_SAMPLES ?? '5', 10);

export function evaluateChampionPromotion(input: {
  challenger: {
    actionType:               string;
    sampleCount:              number;
    winRate:                  number;
    recentWinRate:            number;
    harmRate:                 number;
    avgOutcomeDelta:          number;
    shadowWinRate:            number;
    counterfactualWinRate:    number;
    confidenceCalibrationFit: number;
    trustCompatibility:       number;
  };
  champion: {
    actionType:               string;
    sampleCount:              number;
    winRate:                  number;
    recentWinRate:            number;
    harmRate:                 number;
    avgOutcomeDelta:          number;
    confidenceCalibrationFit: number;
    trustCompatibility:       number;
    decayScore:               number;
  } | null;
  driftScore: number;
}): PromotionResult {
  if (!input.challenger || input.challenger.sampleCount < MIN_CHALLENGER_SAMPLES) {
    return {
      verdict:            'reject',
      decisionConfidence: 0.2,
      rationale:          `Insufficient challenger evidence (n=${input.challenger?.sampleCount ?? 0}, need ${MIN_CHALLENGER_SAMPLES})`,
      score:              0,
      evidence:           { deltaWinRate: 0, deltaOutcome: 0, deltaHarmRate: 0 },
    };
  }

  if (!input.champion) {
    return {
      verdict:            'approve',
      decisionConfidence: 0.85,
      rationale:          'No active champion — first qualified challenger is promoted automatically',
      score:              100,
      evidence:           { deltaWinRate: 0, deltaOutcome: 0, deltaHarmRate: 0 },
    };
  }

  const deltaWinRate  = input.challenger.recentWinRate   - input.champion.recentWinRate;
  const deltaOutcome  = input.challenger.avgOutcomeDelta - input.champion.avgOutcomeDelta;
  const deltaHarmRate = input.champion.harmRate          - input.challenger.harmRate;  // positive = challenger safer

  let score = 0;
  score += deltaWinRate   * 40;
  score += deltaOutcome   * 0.8;
  score += deltaHarmRate  * 30;
  score += input.challenger.shadowWinRate         * 20;
  score += input.challenger.counterfactualWinRate * 25;
  score += (input.champion.decayScore / 100)      * 20;  // normalize decayScore to 0..1
  score += input.driftScore                       * 15;
  score += (input.challenger.confidenceCalibrationFit - input.champion.confidenceCalibrationFit) * 15;
  score += (input.challenger.trustCompatibility       - input.champion.trustCompatibility)       * 10;

  if (score >= 35) return {
    verdict:            'approve',
    decisionConfidence: Math.min(0.95, 0.55 + score / 100),
    rationale:          `Challenger materially outperforms champion (score ${score.toFixed(1)}) — recent win +${(deltaWinRate * 100).toFixed(0)}%, harm safer by ${(deltaHarmRate * 100).toFixed(0)}%`,
    score,
    evidence: { deltaWinRate, deltaOutcome, deltaHarmRate },
  };

  if (score >= 20) return {
    verdict:            'shadow_first',
    decisionConfidence: Math.min(0.85, 0.45 + score / 100),
    rationale:          `Challenger looks promising (score ${score.toFixed(1)}) but needs shadow validation before live promotion`,
    score,
    evidence: { deltaWinRate, deltaOutcome, deltaHarmRate },
  };

  if (score >= 10) return {
    verdict:            'approval_required',
    decisionConfidence: Math.min(0.75, 0.40 + score / 100),
    rationale:          `Promotion case plausible (score ${score.toFixed(1)}) but not strong enough for autonomous approval`,
    score,
    evidence: { deltaWinRate, deltaOutcome, deltaHarmRate },
  };

  return {
    verdict:            'reject',
    decisionConfidence: 0.3,
    rationale:          `Champion still stronger — challenger advantage too weak (score ${score.toFixed(1)})`,
    score,
    evidence: { deltaWinRate, deltaOutcome, deltaHarmRate },
  };
}

/**
 * lib/system/compareChampionVsCausalChallenger.ts
 *
 * Pure function — compares champion vs challenger using BOTH global
 * effectiveness AND context-specific score.
 *
 * This differs from compareChampionVsChallenger (global only) by incorporating
 * how well each performs specifically for the current tenant's context shape.
 *
 * A challenger can win context-specifically even if it is globally weaker —
 * this drives smarter challenger promotion for specific tenant patterns.
 *
 * contextScore: output of scoreCausalContextMatch() averaged across similar memories.
 */

export interface ContextualPerf {
  actionType:       string;
  avgEffectiveness: number;
  contextScore:     number; // 0–100, from scoreCausalContextMatch
}

export interface ContextualComparison {
  betterInContext:              boolean;
  significantlyBetterInContext: boolean;
  delta:                        number;
  weightedChampion:             number;
  weightedChallenger:           number;
  reason:                       string;
}

// ENV-configurable thresholds
const CONTEXTUAL_BETTER_DELTA      = parseFloat(process.env.CONTEXTUAL_BETTER_DELTA       ?? '3');
const CONTEXTUAL_SIGNIFICANT_DELTA = parseFloat(process.env.CONTEXTUAL_SIGNIFICANT_DELTA  ?? '8');

export function compareChampionVsCausalChallenger(params: {
  champion:   ContextualPerf;
  challenger: ContextualPerf;
}): ContextualComparison {
  // 70% effectiveness weight + 30% context-match weight
  const weightedChampion   = params.champion.avgEffectiveness   * 0.7 + (params.champion.contextScore   ?? 0) * 0.3;
  const weightedChallenger = params.challenger.avgEffectiveness * 0.7 + (params.challenger.contextScore  ?? 0) * 0.3;

  const delta = weightedChallenger - weightedChampion;

  const betterInContext              = delta > CONTEXTUAL_BETTER_DELTA;
  const significantlyBetterInContext = delta > CONTEXTUAL_SIGNIFICANT_DELTA;

  let reason = '';
  if (significantlyBetterInContext) {
    reason = `Significantly better in this context (+${delta.toFixed(1)} contextual score)`;
  } else if (betterInContext) {
    reason = `Marginally better in this context (+${delta.toFixed(1)} contextual score)`;
  } else if (delta > 0) {
    reason = `Slightly better contextually but below promotion threshold`;
  } else {
    reason = `Champion holds in this context (challenger delta: ${delta.toFixed(1)})`;
  }

  return { betterInContext, significantlyBetterInContext, delta, weightedChampion, weightedChallenger, reason };
}

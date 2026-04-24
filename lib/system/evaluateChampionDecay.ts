/**
 * lib/system/evaluateChampionDecay.ts
 *
 * Pure function — measures how much a champion's performance has decayed.
 *
 * Decay signals (additive):
 *   +35× win rate regression   (recent < historical)
 *   +40× harm rate regression  (recent > historical)
 *   +30  counterfactual loss rate
 *   +20  calibration error (poor confidence fit)
 *   +25  drift score (environment shifted)
 *   +10  win gap > 7 days
 *   +20  win gap > 21 days
 *
 * Thresholds:
 *   shouldReopen: decayScore ≥ 28  (soft warning, challenger competition widens)
 *   shouldDemote: decayScore ≥ 45  (hard demotion trigger)
 */

export interface DecayResult {
  decayScore:   number;
  shouldDemote: boolean;
  shouldReopen: boolean;
  dominant:     string;  // which decay signal is driving the score
}

export function evaluateChampionDecay(input: {
  historicalWinRate:      number;
  recentWinRate:          number;
  historicalHarmRate:     number;
  recentHarmRate:         number;
  counterfactualLossRate: number;
  daysSinceLastWin:       number;
  calibrationError:       number;
  driftScore:             number;
}): DecayResult {
  const winRegression  = Math.max(0, input.historicalWinRate  - input.recentWinRate)  * 35;
  const harmRegression = Math.max(0, input.recentHarmRate     - input.historicalHarmRate) * 40;
  const cfLoss         = input.counterfactualLossRate * 30;
  const calibError     = input.calibrationError       * 20;
  const drift          = input.driftScore             * 25;
  let   winGap         = 0;
  if (input.daysSinceLastWin > 21) winGap = 20;
  else if (input.daysSinceLastWin > 7) winGap = 10;

  const decayScore = winRegression + harmRegression + cfLoss + calibError + drift + winGap;

  const components = { winRegression, harmRegression, cfLoss, calibError, drift, winGap };
  const dominant = Object.entries(components).sort((a, b) => b[1] - a[1])[0][0];

  return {
    decayScore:   parseFloat(decayScore.toFixed(2)),
    shouldDemote: decayScore >= 45,
    shouldReopen: decayScore >= 28,
    dominant,
  };
}

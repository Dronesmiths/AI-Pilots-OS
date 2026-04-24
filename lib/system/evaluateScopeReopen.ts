/**
 * lib/system/evaluateScopeReopen.ts
 *
 * Pure function — determines if a locked/soft_locked market should reopen.
 * Returns shouldReopen=false for already-open or already-reopened markets.
 *
 * Checked in priority order:
 *   1. Drift detected (highest priority)
 *   2. Champion decay
 *   3. Counterfactual losses
 *   4. Calibration poor + hit rate low (challenger outperformance signal)
 */

export type ReopenReason =
  | 'none'
  | 'performance_decay'
  | 'drift_detected'
  | 'challenger_outperformance'
  | 'counterfactual_losses'
  | 'harm_spike';

export interface ScopeReopenResult {
  shouldReopen: boolean;
  reopenReason: ReopenReason;
}

export function evaluateScopeReopen(input: {
  marketStatus:           'open' | 'soft_locked' | 'locked' | 'reopened' | 'degraded';
  championDecayScore:     number;
  driftScore:             number;
  counterfactualLossRate: number;
  calibrationError:       number;
  plannerHitRate:         number;
  recentHarmRate?:        number;
}): ScopeReopenResult {
  const alreadyOpen = input.marketStatus === 'open' || input.marketStatus === 'reopened';
  if (alreadyOpen) return { shouldReopen: false, reopenReason: 'none' };

  // Harm spike — immediate reopen regardless of lock state
  if ((input.recentHarmRate ?? 0) >= 0.3) {
    return { shouldReopen: true, reopenReason: 'harm_spike' };
  }

  if (input.driftScore >= 0.55) {
    return { shouldReopen: true, reopenReason: 'drift_detected' };
  }

  if (input.championDecayScore >= 45) {
    return { shouldReopen: true, reopenReason: 'performance_decay' };
  }

  if (input.counterfactualLossRate >= 0.35) {
    return { shouldReopen: true, reopenReason: 'counterfactual_losses' };
  }

  if (input.calibrationError >= 0.25 && input.plannerHitRate < 0.55) {
    return { shouldReopen: true, reopenReason: 'challenger_outperformance' };
  }

  return { shouldReopen: false, reopenReason: 'none' };
}

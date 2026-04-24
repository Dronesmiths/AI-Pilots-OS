/**
 * lib/system/applySelfDoubtAdjustment.ts
 *
 * Pure function — applies self-doubt adjustments to a candidate's score
 * and confidence label based on the scope's confidence calibration history.
 *
 * Overconfidence adjustment (score too high relative to delivery):
 *   overconfidenceScore > 0.3 → score -10, confidence downgrade
 *   overconfidenceScore > 0.6 → score -20, confidence downgrade ×2
 *
 * Underconfidence lift (scope consistently delivers more than expected):
 *   underconfidenceScore > 0.3 → score +8
 *
 * Uncertainty level (from calibrationError → informs challenger exploration width):
 *   < 0.12 → low
 *   < 0.25 → medium
 *   ≥ 0.25 → high
 *
 * Minimum sample guard: no adjustments applied if fewer than 3 samples —
 * prevents a single data point from prematurely penalizing a scope.
 */

import type { ConfidenceCalibration } from './getPlannerConfidenceCalibration';

type ConfidenceLevel = 'low' | 'medium' | 'high';
type UncertaintyLevel = 'low' | 'medium' | 'high';

const CONFIDENCE_DOWN: Record<ConfidenceLevel, ConfidenceLevel> = {
  high:   'medium',
  medium: 'low',
  low:    'low',  // cannot go below low
};

const MIN_SAMPLES_FOR_SELFDOUBT = 3;

export interface SelfDoubtResult {
  adjustedScore:      number;
  adjustedConfidence: ConfidenceLevel;
  uncertaintyLevel:   UncertaintyLevel;
  selfDoubtApplied:   boolean;
}

export function applySelfDoubtAdjustment(input: {
  baseConfidence: ConfidenceLevel;
  score:          number;
  calibration:    ConfidenceCalibration;
}): SelfDoubtResult {
  const { score, baseConfidence, calibration } = input;

  // Cold start — no adjustments
  if (calibration.totalSamples < MIN_SAMPLES_FOR_SELFDOUBT) {
    return {
      adjustedScore:      score,
      adjustedConfidence: baseConfidence,
      uncertaintyLevel:   'medium', // assume medium until calibrated
      selfDoubtApplied:   false,
    };
  }

  let adjustedScore      = score;
  let adjustedConfidence = baseConfidence;
  let selfDoubtApplied   = false;

  // ── Overconfidence penalty ─────────────────────────────────────────────────
  if (calibration.overconfidenceScore > 0.6) {
    adjustedScore      -= 20;
    adjustedConfidence  = CONFIDENCE_DOWN[CONFIDENCE_DOWN[adjustedConfidence]];
    selfDoubtApplied    = true;
  } else if (calibration.overconfidenceScore > 0.3) {
    adjustedScore      -= 10;
    adjustedConfidence  = CONFIDENCE_DOWN[adjustedConfidence];
    selfDoubtApplied    = true;
  }

  // ── Underconfidence lift ────────────────────────────────────────────────────
  if (calibration.underconfidenceScore > 0.3) {
    adjustedScore     += 8;
    selfDoubtApplied   = true;
  }

  // ── Uncertainty level ──────────────────────────────────────────────────────
  const uncertaintyLevel: UncertaintyLevel =
    calibration.calibrationError >= 0.25 ? 'high' :
    calibration.calibrationError >= 0.12 ? 'medium' :
    'low';

  return {
    adjustedScore:      Math.round(adjustedScore),
    adjustedConfidence,
    uncertaintyLevel,
    selfDoubtApplied,
  };
}

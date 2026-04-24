/**
 * models/governance/RubricTuningControlState.ts
 *
 * Singleton circuit breaker for rubric adaptive tuning.
 * status: normal | watch | paused
 *
 * Loaded by rubricStabilityGuardrails before any tuning cycle runs.
 * Updated automatically when drift/oscillation exceeds policy thresholds.
 */
import mongoose, { Schema } from 'mongoose';

const RubricTuningControlStateSchema = new Schema({
  status:      { type: String, default: 'normal', enum: ['normal','watch','paused'] },
  reason:      { type: String, default: '' },
  pausedAt:    { type: Date },
  resumeAfter: { type: Date },
  lastCheckedAt: { type: Date },

  // Snapshot of signal values that triggered the current status
  triggerSignals: {
    driftScore:         { type: Number, default: 0 },
    maxOscillation:     { type: Number, default: 0 },
    safetyErosion:      { type: Boolean, default: false },
    cadenceViolations:  { type: Number, default: 0 },
  },
}, { timestamps: true });

export default mongoose.models.RubricTuningControlState ||
  mongoose.model('RubricTuningControlState', RubricTuningControlStateSchema);

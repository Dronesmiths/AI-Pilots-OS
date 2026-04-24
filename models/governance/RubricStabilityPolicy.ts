/**
 * models/governance/RubricStabilityPolicy.ts
 *
 * Singleton policy record (policyKey: 'default').
 * Defines the legal boundaries for rubric weight evolution.
 * Seeded on first use via upsert — no migration required.
 *
 * Safety contract:
 *   - minSafetyWeight is stricter than the PromotionRubricVersion schema minimum
 *   - policy can only be tightened, not loosened, by adaptive tuning
 *   - pauseOnSafetyErosion is immutable (always true at runtime)
 */
import mongoose, { Schema } from 'mongoose';

const RubricStabilityPolicySchema = new Schema({
  policyKey: { type: String, unique: true, required: true, default: 'default' },

  limits: {
    maxSingleVersionWeightShift: { type: Number, default: 0.08 },   // max weight move per upgrade
    maxTotalShiftFromBaseline:   { type: Number, default: 0.20 },   // max total drift from v1
    minSafetyWeight:             { type: Number, default: 0.12 },   // stricter than model min (0.10)
    minConfidenceWeight:         { type: Number, default: 0.08 },
    maxCausalWeight:             { type: Number, default: 0.45 },
    minRewardWeight:             { type: Number, default: 0.10 },
    minSafetyPlusConfidence:     { type: Number, default: 0.22 },   // combined floor anti-optimization
  },

  cadence: {
    minDaysBetweenPromotions:  { type: Number, default: 7  },
    maxPromotionsPer30Days:    { type: Number, default: 2  },
    cooldownDaysAfterRollback: { type: Number, default: 14 },
  },

  antiDrift: {
    oscillationWindow:     { type: Number,  default: 5    }, // look-back: N versions
    maxOscillationCount:   { type: Number,  default: 2    }, // max sign flips before flag
    pauseOnSafetyErosion:  { type: Boolean, default: true }, // always pause if safety declines
    driftWatchThreshold:   { type: Number,  default: 0.40 }, // driftScore (0-1) → watch status
    driftPauseThreshold:   { type: Number,  default: 0.70 }, // driftScore → auto-pause
  },

  active: { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.models.RubricStabilityPolicy ||
  mongoose.model('RubricStabilityPolicy', RubricStabilityPolicySchema);

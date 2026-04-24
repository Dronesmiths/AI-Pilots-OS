/**
 * models/governance/GovernanceMetaControlState.ts
 *
 * Singleton system-wide throttle control state.
 * Read by other subsystems before executing adaptive actions.
 *
 * Checked by:
 *   manageAdaptiveRubricTuning    → pauseRubricPromotions
 *   manageCausalShadowPromotion   → pauseLiveBanditRollouts
 *   applyGlobalArmPriorsToBandit  → reducePriorInfluence
 *   buildPromotionReviewCase      → requireManualPromotionReview
 */
import mongoose, { Schema } from 'mongoose';

const GovernanceMetaControlStateSchema = new Schema({
  status: { type: String, default: 'normal', enum: ['normal','watch','throttled','paused'] },

  controls: {
    pauseRubricPromotions:       { type: Boolean, default: false },
    pauseLiveBanditRollouts:     { type: Boolean, default: false },
    reducePriorInfluence:        { type: Boolean, default: false },
    requireManualPromotionReview:{ type: Boolean, default: false },
  },

  reason:      { type: String, default: '' },
  activatedAt: { type: Date },
  resumeAfter: { type: Date },

  // Score that triggered this state change
  triggeringScore: { type: Number, default: 100 },
}, { timestamps: true });

export default mongoose.models.GovernanceMetaControlState ||
  mongoose.model('GovernanceMetaControlState', GovernanceMetaControlStateSchema);

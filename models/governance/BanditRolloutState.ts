/**
 * models/governance/BanditRolloutState.ts
 *
 * Granular rollout control for each bandit — separate from the bandit's own
 * mode field so the bandit config and its operational state are decoupled.
 *
 * Rollout modes (progressive, never skip steps):
 *   shadow_only      — bandit learns but never controls live response
 *   live_low_only    — bandit selects response for LOW severity anomalies only
 *   live_low_medium  — bandit selects for LOW + MEDIUM severity anomalies
 *   paused           — bandit frozen (no learning, no live selection)
 *   manual_only      — bandit suggests winning arm, human approves each use
 *
 * Safety defaults: founderSafeMode always ON, humanReview required for promotion.
 */
import mongoose, { Schema } from 'mongoose';

const BanditRolloutStateSchema = new Schema({
  banditId: { type: String, index: true, required: true, unique: true },

  rolloutMode: {
    type: String, required: true, default: 'shadow_only',
    enum: ['shadow_only', 'live_low_only', 'live_low_medium', 'paused', 'manual_only'],
  },

  previousMode: { type: String, default: 'shadow_only' }, // for resume after pause

  controls: {
    maxLiveSeverity:                { type: String, default: 'low', enum: ['low', 'medium', 'high'] },
    founderSafeMode:                { type: Boolean, default: true },
    requireHumanReviewForPromotion: { type: Boolean, default: true },
  },

  gateSnapshot: {           // captured when last moving INTO a live mode
    pullsAtActivation:      { type: Number, default: 0 },
    avgRewardAtActivation:  { type: Number, default: 0 },
    activatedAt:            { type: Date },
  },

  status: {
    active: { type: Boolean, default: true },
    notes:  { type: String, default: '' },
  },
}, { timestamps: true });

export default mongoose.models.BanditRolloutState ||
  mongoose.model('BanditRolloutState', BanditRolloutStateSchema);

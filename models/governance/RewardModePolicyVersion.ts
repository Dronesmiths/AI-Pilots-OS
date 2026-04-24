/**
 * models/governance/RewardModePolicyVersion.ts
 *
 * Version history for a bandit's reward mode configuration.
 * Each promotion or rollback creates a new version record.
 * The 'active' version represents current behavior.
 * status: active | previous | rolled_back
 */
import mongoose, { Schema } from 'mongoose';

const RewardModePolicyVersionSchema = new Schema({
  banditId:      { type: String, index: true, required: true },
  versionNumber: { type: Number, required: true },

  config: {
    rewardMode:  { type: String, required: true, enum: ['live_reward','causal_shadow','causal_weighted_live'] },
    rolloutMode: { type: String, default: 'shadow_only' },
  },

  status:        { type: String, default: 'active', enum: ['active','previous','rolled_back'] },
  activatedAt:   { type: Date, default: Date.now },
  deactivatedAt: { type: Date },

  snapshotAtActivation: {
    liveLeader:    { type: String, default: '' },
    avgReward:     { type: Number, default: 0 },
    harmfulRate:   { type: Number, default: 0 },
    totalPulls:    { type: Number, default: 0 },
    confidence:    { type: Number, default: 0 },
  },
}, { timestamps: true });

RewardModePolicyVersionSchema.index({ banditId: 1, versionNumber: 1 }, { unique: true });
RewardModePolicyVersionSchema.index({ banditId: 1, status: 1 });

export default mongoose.models.RewardModePolicyVersion ||
  mongoose.model('RewardModePolicyVersion', RewardModePolicyVersionSchema);

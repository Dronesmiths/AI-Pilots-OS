/**
 * models/governance/CausalWeightedRewardLog.ts
 *
 * Append-only record of every dual reward computation.
 * One entry per BanditArmPull that has been through causal evaluation.
 *
 * Gives the dashboard a full comparison trail:
 *   liveReward vs causalWeightedReward, with all components visible.
 *
 * The `mode` field starts as 'shadow' — will become 'live' only after
 * shouldPromoteCausalWeightedReward() passes all gates and a human approves.
 */
import mongoose, { Schema } from 'mongoose';

const CausalWeightedRewardLogSchema = new Schema({
  banditPullId: { type: String, index: true, required: true },
  banditId:     { type: String, index: true, required: true },
  armId:        { type: String, index: true, required: true },
  anomalyId:    { type: String, index: true, required: true },
  operatorId:   { type: String, index: true, required: true },

  liveReward:           { type: Number, required: true },
  causalWeightedReward: { type: Number, required: true },

  delta: { type: Number, default: 0 }, // causalWeightedReward - liveReward

  components: {
    observedReward:          { type: Number, default: 0 },
    causalScore:             { type: Number, default: 0 },  // causalImpact.overallImpactScore
    attributionConfidence:   { type: Number, default: 0 },  // confidence.score
    gatedCausalScore:        { type: Number, default: 0 },  // causalScore × confidence
    harmful:                 { type: Boolean, default: false },
    confounded:              { type: Boolean, default: false },
  },

  // Agreement flag: does causal ranking agree with live ranking for this arm?
  rankDelta: { type: Number, default: 0 }, // positive = causal upgrades this arm, negative = downgrades

  mode: { type: String, default: 'shadow', enum: ['shadow', 'live'] },
}, { timestamps: true });

CausalWeightedRewardLogSchema.index({ banditId: 1, createdAt: -1 });
CausalWeightedRewardLogSchema.index({ banditId: 1, armId: 1, createdAt: -1 });

export default mongoose.models.CausalWeightedRewardLog ||
  mongoose.model('CausalWeightedRewardLog', CausalWeightedRewardLogSchema);

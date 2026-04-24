/**
 * models/governance/BanditArmPull.ts  (v2 — adds contextKey)
 *
 * contextKey is now indexed so divergence analysis can query by context
 * without a banditId join — enables cross-bandit context performance queries.
 */
import mongoose, { Schema } from 'mongoose';

const BanditArmPullSchema = new Schema({
  banditId:   { type: String, index: true, required: true },
  armId:      { type: String, index: true, required: true },
  anomalyId:  { type: String, index: true, required: true },
  operatorId: { type: String, index: true, required: true },
  tenantId:   { type: String, index: true },

  contextKey:  { type: String, index: true, default: '' }, // e.g. "sudden_drop:high:low"
  shadowMode:  { type: Boolean, default: true },  // true = shadow observation only
  liveResponse:{ type: String, default: '' },      // what actually fired (for comparison)

  context: {
    trustBand:       { type: String, default: '' },
    severityBand:    { type: String, default: '' },
    trustLevel:      { type: String, default: '' },
    severity:        { type: String, default: '' },
    delegationLevel: { type: String, default: '' },
    operatorRole:    { type: String, default: '' },
  },

  outcome: {
    reward:               { type: Number },
    effectivenessScore:   { type: Number },
    counterfactualImpact: { type: Number },
    harmful:              { type: Boolean, default: false },
    causalWeightedReward: { type: Number },      // populated by applyCausalShadowReward
  },

  // Prior influence snapshot (populated by applyGlobalArmPriorsToBandit at selection time)
  priorInfluence: {
    priorWeight:   { type: Number, default: 0 }, // 0 = pure local, 1 = pure prior
    localWeight:   { type: Number, default: 1 },
    blendedScore:  { type: Number, default: 0 }, // actual value used in ranking
    priorScopeKey: { type: String, default: '' }, // which prior was applied
    priorAvgReward:{ type: Number, default: 0 },
    appliedPrior:  { type: Boolean, default: false },
  },

  // Reference to detailed causal attribution record (populated by pipeline)
  causalAttributionId: { type: String, default: '' },

  selectedAt:  { type: Date, default: Date.now },
  evaluatedAt: { type: Date },
}, { timestamps: true });

BanditArmPullSchema.index({ banditId: 1, armId: 1, createdAt: -1 });
BanditArmPullSchema.index({ contextKey: 1, 'outcome.reward': 1 }); // divergence analysis
BanditArmPullSchema.index({ anomalyId: 1 });
BanditArmPullSchema.index({ evaluatedAt: 1, 'outcome.reward': 1 });

export default mongoose.models.BanditArmPull ||
  mongoose.model('BanditArmPull', BanditArmPullSchema);

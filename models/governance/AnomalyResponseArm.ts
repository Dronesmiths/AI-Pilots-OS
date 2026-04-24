/**
 * models/governance/AnomalyResponseArm.ts  (v2 — adds shadowStats)
 *
 * shadowStats tracks causal-weighted reward in parallel without touching live stats.
 * Live arm selection always reads `stats`, never `shadowStats`.
 * The causal-shadow dashboard reads both to compute the delta.
 *
 * UCB1 helper: sumSquaredRewards tracks variance for future Bayesian upgrade.
 */
import mongoose, { Schema } from 'mongoose';

const AnomalyResponseArmSchema = new Schema({
  banditId:     { type: String, index: true, required: true },
  responseType: { type: String, required: true },
  allowed:      { type: Boolean, default: true },

  stats: {
    pulls:             { type: Number, default: 0 },
    totalReward:       { type: Number, default: 0 },
    averageReward:     { type: Number, default: 0 },
    harmfulCount:      { type: Number, default: 0 },
    lastPullAt:        { type: Date },
    sumSquaredRewards: { type: Number, default: 0 },
  },

  // Shadow causal-weighted reward track — never controls live selection
  shadowStats: {
    pulls:         { type: Number, default: 0 },
    totalReward:   { type: Number, default: 0 },
    averageReward: { type: Number, default: 0 },
    // Causal-adjusted components (cumulative averages for dashboard)
    avgCausalScore:          { type: Number, default: 0 },
    avgAttributionConfidence:{ type: Number, default: 0 },
    confoundedCount:         { type: Number, default: 0 },
  },

  safety: {
    maxSeverity:     { type: String, default: 'critical', enum: ['low','medium','high','critical'] },
    founderSafeOnly: { type: Boolean, default: false },
  },
}, { timestamps: true });

AnomalyResponseArmSchema.index({ banditId: 1, allowed: 1, 'stats.averageReward': -1 });
AnomalyResponseArmSchema.index({ banditId: 1, 'shadowStats.averageReward': -1 });

export default mongoose.models.AnomalyResponseArm ||
  mongoose.model('AnomalyResponseArm', AnomalyResponseArmSchema);

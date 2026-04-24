/**
 * models/SeoBanditState.ts
 *
 * Persistent per-campaign epsilon-greedy bandit arm state.
 * Unique by (scopeType, scopeId, strategyType).
 */

import { Schema, model, models } from 'mongoose';

const ArmSchema = new Schema(
  {
    action:      { type: String, enum: ['boost','reinforce','internal_links','publish','service_location','question','cost','comparison','cluster_expansion'], required: true },
    pulls:       { type: Number, default: 0 },
    totalReward: { type: Number, default: 0 },
    avgReward:   { type: Number, default: 0 },
    lastReward:  { type: Number, default: 0 },
    lastUsedAt:  { type: Date,   default: null },

    // ── ROI tracking ───────────────────────────────────────────────
    // Populated by updateBanditROI() when GSC outcomes land.
    // All default to 0 so existing documents are valid without migration.
    roiMetrics: {
      totalCost:      { type: Number, default: 0 },
      totalValue:     { type: Number, default: 0 },
      avgROI:         { type: Number, default: 0 },   // totalValue / totalCost
      lastValue:      { type: Number, default: 0 },
      lastCost:       { type: Number, default: 0 },
      valueVelocity:  { type: Number, default: 0 },   // value delta vs prior event
      roiUpdateCount: { type: Number, default: 0 },   // how many outcome events fed in
    },
  },
  { _id: false }
);

const SeoBanditStateSchema = new Schema(
  {
    scopeType: {
      type: String, enum: ['global','campaign','user'], required: true, index: true,
    },
    scopeId: { type: String, required: true, index: true },

    strategyType: {
      type: String,
      enum: ['recovery','expansion','publish_push','internal_linking','mixed'],
      required: true, index: true,
    },

    epsilon: { type: Number, default: 0.15 },

    arms: {
      type: [ArmSchema],
      default: () => [
        { action: 'boost',          pulls: 0, totalReward: 0, avgReward: 0 },
        { action: 'reinforce',      pulls: 0, totalReward: 0, avgReward: 0 },
        { action: 'internal_links', pulls: 0, totalReward: 0, avgReward: 0 },
        { action: 'publish',        pulls: 0, totalReward: 0, avgReward: 0 },
      ],
    },
  },
  { timestamps: true }
);

SeoBanditStateSchema.index({ scopeType: 1, scopeId: 1, strategyType: 1 }, { unique: true });

export default models.SeoBanditState || model('SeoBanditState', SeoBanditStateSchema);

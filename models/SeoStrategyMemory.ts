/**
 * models/SeoStrategyMemory.ts
 *
 * Durable record of what action a campaign chose, in what context,
 * and what reward it earned. Input for bandit learning.
 */

import { Schema, model, models } from 'mongoose';

const SeoStrategyMemorySchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: 'SeoCampaign', index: true },
    userId:     { type: Schema.Types.ObjectId, ref: 'User',        index: true },

    strategyType: {
      type: String,
      enum: ['recovery','expansion','publish_push','internal_linking','mixed'],
      required: true, index: true,
    },

    action: {
      type: String,
      enum: ['boost','reinforce','internal_links','publish','enhance','rebuild'],
      required: true, index: true,
    },

    context: {
      stuck6:               { type: Number, default: 0 },
      stuck10Plus:          { type: Number, default: 0 },
      queued:               { type: Number, default: 0 },
      processing:           { type: Number, default: 0 },
      published:            { type: Number, default: 0 },
      healthyIndexed:       { type: Number, default: 0 },
      lowInternalLinksCount:{ type: Number, default: 0 },
      daysSinceLastPublish: { type: Number, default: 0 },
    },

    outcome: {
      jobsQueued:     { type: Number, default: 0 },
      jobsCompleted:  { type: Number, default: 0 },
      jobsFailed:     { type: Number, default: 0 },
      recoveredPages: { type: Number, default: 0 },
      improvedPages:  { type: Number, default: 0 },
      publishCount:   { type: Number, default: 0 },
      scoreDelta:     { type: Number, default: 0 },
    },

    reward: { type: Number, default: 0, index: true },
    notes:  { type: String, default: '' },
  },
  { timestamps: true }
);

SeoStrategyMemorySchema.index({ strategyType: 1, action: 1, createdAt: -1 });
SeoStrategyMemorySchema.index({ campaignId: 1, createdAt: -1 });
SeoStrategyMemorySchema.index({ userId: 1, strategyType: 1, createdAt: -1 });

export default models.SeoStrategyMemory || model('SeoStrategyMemory', SeoStrategyMemorySchema);

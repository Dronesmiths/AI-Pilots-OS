/**
 * models/SeoCampaignRun.ts
 *
 * Immutable per-execution record for a campaign pass.
 * Provides audit trail: how many targets, jobs queued/deduped, outcome.
 */

import { Schema, model, models } from 'mongoose';

const SeoCampaignRunSchema = new Schema(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'SeoCampaign',
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['started', 'completed', 'partial', 'failed'],
      default: 'started',
      index: true,
    },

    summary: {
      targetsEvaluated:  { type: Number, default: 0 },
      jobsQueued:        { type: Number, default: 0 },
      jobsDeduped:       { type: Number, default: 0 },
      jobsFailedToQueue: { type: Number, default: 0 },
    },

    actions: [{ type: Schema.Types.Mixed }],
    error:   { type: String, default: null },
  },
  { timestamps: true }
);

SeoCampaignRunSchema.index({ campaignId: 1, createdAt: -1 });

export default models.SeoCampaignRun || model('SeoCampaignRun', SeoCampaignRunSchema);

/**
 * models/SeoCampaign.ts
 *
 * Durable strategic campaign — sits above individual jobs.
 * Campaign → targets scope + strategy + constraints → creates SeoActionJobs.
 * Jobs still execute through the same durable queue (no bypass).
 */

import { Schema, model, models } from 'mongoose';

const SeoCampaignSchema = new Schema(
  {
    name: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'draft',
      index: true,
    },

    scope: {
      mode: {
        type: String,
        enum: ['single_site', 'selected_sites', 'autopilot_top', 'all_matching'],
        required: true,
      },
      userIds: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
      filters: { type: Schema.Types.Mixed, default: {} },
    },

    strategy: {
      type: {
        type: String,
        enum: ['recovery', 'expansion', 'publish_push', 'internal_linking', 'mixed'],
        required: true,
      },
      primaryAction: {
        type: String,
        enum: ['boost', 'reinforce', 'internal_links', 'publish', 'enhance', 'rebuild'],
        required: true,
      },
      secondaryActions: [{ type: String }],
    },

    goals: {
      targetJobs:          { type: Number, default: 0 },
      targetPages:         { type: Number, default: 0 },
      targetSites:         { type: Number, default: 0 },
      targetRecoveryCount: { type: Number, default: 0 },
      notes:               { type: String, default: '' },
    },

    schedule: {
      startsAt:         { type: Date, default: Date.now },
      endsAt:           { type: Date, default: null },
      runEveryMinutes:  { type: Number, default: 60 },
    },

    constraints: {
      maxJobsPerRun:   { type: Number,  default: 25 },
      maxJobsPerSite:  { type: Number,  default: 5  },
      safeActionsOnly: { type: Boolean, default: true },
      requireApproval: { type: Boolean, default: true },
    },

    progress: {
      jobsQueued:    { type: Number, default: 0 },
      jobsCompleted: { type: Number, default: 0 },
      jobsFailed:    { type: Number, default: 0 },
      sitesTouched:  { type: Number, default: 0 },
      pagesTouched:  { type: Number, default: 0 },
      lastRunAt:     { type: Date,   default: null },
      lastOutcome:   { type: String, default: '' },
    },

    memory: {
      lastRecommendedAction: { type: String, default: '' },
      lastReason:            { type: String, default: '' },
      lastTopTargets:        { type: [Schema.Types.Mixed], default: [] },
    },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

SeoCampaignSchema.index({ status: 1, 'schedule.startsAt': 1 });
SeoCampaignSchema.index({ 'scope.mode': 1, 'strategy.type': 1 });

export default models.SeoCampaign || model('SeoCampaign', SeoCampaignSchema);

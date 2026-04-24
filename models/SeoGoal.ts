/**
 * models/SeoGoal.ts
 *
 * Top-level intent layer. A goal tells the orchestrator WHAT the system is
 * trying to achieve at the fleet level. The orchestrator evaluates goals
 * every cycle and decides which command/campaign to fire.
 */

import { Schema, model, models } from 'mongoose';

const SeoGoalSchema = new Schema(
  {
    name: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['active', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'active',
      index: true,
    },

    type: {
      type: String,
      enum: [
        'recover_stuck_pages',
        'increase_publish_velocity',
        'spread_internal_authority',
        'protect_top_sites',
        'mixed_growth',
      ],
      required: true,
      index: true,
    },

    scope: {
      mode: {
        type: String,
        enum: ['global', 'selected_sites', 'autopilot_top'],
        default: 'global',
      },
      userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    },

    targets: {
      minRecoveredPages:   { type: Number, default: 0 },
      minPublished7d:      { type: Number, default: 0 },
      minHealthyIndexed:   { type: Number, default: 0 },
      maxStuck6:           { type: Number, default: 0 },
      maxPendingApprovals: { type: Number, default: 25 },
    },

    strategy: {
      preferredActions:       [{ type: String }],
      preferredCampaignType:  { type: String, default: '' },
      aggressive:             { type: Boolean, default: false },
    },

    progress: {
      currentRecoveredPages:  { type: Number, default: 0 },
      currentPublished7d:     { type: Number, default: 0 },
      currentHealthyIndexed:  { type: Number, default: 0 },
      currentStuck6:          { type: Number, default: 0 },
      lastEvaluationAt:       { type: Date,   default: null },
      lastDecision:           { type: String, default: '' },
      lastOutcome:            { type: String, default: '' },
    },

    constraints: {
      maxCommandsPerHour:          { type: Number,  default: 3 },
      maxCampaignRunsPerHour:      { type: Number,  default: 3 },
      requireApprovalForGuarded:   { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

SeoGoalSchema.index({ status: 1, type: 1 });

export default models.SeoGoal || model('SeoGoal', SeoGoalSchema);

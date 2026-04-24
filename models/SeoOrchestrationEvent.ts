/**
 * models/SeoOrchestrationEvent.ts
 *
 * Immutable audit trail for all orchestrator decisions.
 * Every goal evaluation, trigger fire, and command execution is logged here.
 * Never deleted — append-only.
 */

import { Schema, model, models } from 'mongoose';

const SeoOrchestrationEventSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, ref: 'SeoGoal', index: true },

    type: {
      type: String,
      enum: [
        'goal_evaluated',
        'trigger_fired',
        'command_recommended',
        'command_executed',
        'campaign_recommended',
        'campaign_executed',
        'action_skipped',
        'safety_block',
      ],
      required: true,
      index: true,
    },

    severity: {
      type: String,
      enum: ['info', 'warning', 'error'],
      default: 'info',
    },

    message:     { type: String, required: true },
    explanation: { type: String, default: '' },
    meta:        { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

SeoOrchestrationEventSchema.index({ createdAt: -1 });
SeoOrchestrationEventSchema.index({ type: 1, createdAt: -1 });

export default models.SeoOrchestrationEvent || model('SeoOrchestrationEvent', SeoOrchestrationEventSchema);

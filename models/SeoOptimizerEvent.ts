/**
 * models/SeoOptimizerEvent.ts
 *
 * Immutable audit trail for every optimizer decision.
 * goal_scored, budget_allocated, goal_selected, action_mix_selected, etc.
 */

import { Schema, model, models } from 'mongoose';

const SeoOptimizerEventSchema = new Schema({
  type: {
    type: String,
    enum: [
      'goal_scored',
      'budget_allocated',
      'goal_deprioritized',
      'goal_selected',
      'goal_skipped',
      'budget_exhausted',
      'action_mix_selected',
    ],
    required: true,
    index: true,
  },

  goalId:   { type: Schema.Types.ObjectId, ref: 'SeoGoal', index: true },
  goalName: { type: String, default: '' },
  message:  { type: String, required: true },
  explanation: { type: String, default: '' },
  meta:     { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

SeoOptimizerEventSchema.index({ createdAt: -1 });
SeoOptimizerEventSchema.index({ type: 1, createdAt: -1 });

export default models.SeoOptimizerEvent || model('SeoOptimizerEvent', SeoOptimizerEventSchema);

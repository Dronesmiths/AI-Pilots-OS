/**
 * models/SeoOptimizerState.ts
 *
 * Snapshot of one optimizer cycle: how budget was split across goals,
 * which actions were chosen, and scores used for arbitration.
 * Append-only — one document per cycle run.
 */

import { Schema, model, models } from 'mongoose';

const GoalBudgetSchema = new Schema({
  goalId:           { type: Schema.Types.ObjectId, ref: 'SeoGoal', required: true },
  goalName:         { type: String, required: true },
  priorityScore:    { type: Number, default: 0 },
  urgencyScore:     { type: Number, default: 0 },
  opportunityScore: { type: Number, default: 0 },
  rewardScore:      { type: Number, default: 0 },
  allocatedCommands:    { type: Number, default: 0 },
  allocatedCampaignRuns:{ type: Number, default: 0 },
  chosenAction:     { type: String, default: '' },
  chosenTarget:     { type: String, default: '' },
  explanation:      { type: String, default: '' },
}, { _id: false });

const SeoOptimizerStateSchema = new Schema({
  windowStart: { type: Date, required: true, index: true },
  windowEnd:   { type: Date, required: true, index: true },

  totalCommandBudget:  { type: Number, default: 0 },
  totalCampaignBudget: { type: Number, default: 0 },

  goalBudgets: { type: [GoalBudgetSchema], default: [] },

  meta: {
    totalGoalsEvaluated:         { type: Number, default: 0 },
    totalCommandsAllocated:      { type: Number, default: 0 },
    totalCampaignRunsAllocated:  { type: Number, default: 0 },
  },
}, { timestamps: true });

SeoOptimizerStateSchema.index({ windowStart: -1 });

export default models.SeoOptimizerState || model('SeoOptimizerState', SeoOptimizerStateSchema);

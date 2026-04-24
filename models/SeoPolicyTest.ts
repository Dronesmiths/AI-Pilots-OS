/**
 * models/SeoPolicyTest.ts
 *
 * Records a policy simulation comparison run.
 * Stores which policy "won" based on predicted aggregate impact.
 * Note: all policies currently run through the same scoring — differentiation
 * happens as calibration data accumulates and policy-specific action filters diverge.
 */

import { Schema, model, models } from 'mongoose';

const ComparisonSchema = new Schema({
  against: String,
  winner:  String,
  delta:   Number,
}, { _id: false });

const SeoPolicyTestSchema = new Schema({
  name:       { type: String, required: true },
  policyType: { type: String, enum: ['bandit','heuristic','aggressive','conservative'], index: true },

  results: {
    totalPredictedRecovery:  Number,
    totalPredictedGrowth:    Number,
    totalPredictedIndexLift: Number,
    avgConfidence:           Number,
  },

  comparisons: { type: [ComparisonSchema], default: [] },
}, { timestamps: true });

SeoPolicyTestSchema.index({ createdAt: -1 });

export default models.SeoPolicyTest || model('SeoPolicyTest', SeoPolicyTestSchema);

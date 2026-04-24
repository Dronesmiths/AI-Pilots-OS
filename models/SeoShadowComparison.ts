/**
 * models/SeoShadowComparison.ts
 *
 * Pairs a shadow prediction (what we said we'd do) against a live execution
 * (what we actually did) using a shared comparisonKey.
 * Verdict: shadow / live / tie / unknown.
 */

import { Schema, model, models } from 'mongoose';

const SeoShadowComparisonSchema = new Schema({
  comparisonKey: { type: String, required: true, index: true },

  userId:   { type: Schema.Types.ObjectId, ref: 'User',    default: null, index: true },
  goalType: { type: String, default: '' },
  action:   { type: String, required: true, index: true },
  target:   { type: String, default: '' },

  shadowPredictionId: { type: Schema.Types.ObjectId, ref: 'SeaPredictionRecord', default: null },
  livePredictionId:   { type: Schema.Types.ObjectId, ref: 'SeaPredictionRecord', default: null },

  shadow: {
    predictedRecovery:  { type: Number, default: 0 },
    predictedGrowth:    { type: Number, default: 0 },
    predictedIndexLift: { type: Number, default: 0 },
    confidence:         { type: Number, default: 0 },
  },

  live: {
    actualRecovery:  { type: Number, default: 0 },
    actualGrowth:    { type: Number, default: 0 },
    actualIndexLift: { type: Number, default: 0 },
    confidence:      { type: Number, default: 0 },
  },

  verdict: {
    winner:      { type: String, enum: ['shadow','live','tie','unknown'], default: 'unknown', index: true },
    deltaScore:  { type: Number, default: 0 },
    explanation: { type: String, default: '' },
  },
}, { timestamps: true });

SeoShadowComparisonSchema.index({ comparisonKey: 1, action: 1 }, { unique: true });
SeoShadowComparisonSchema.index({ action: 1, createdAt: -1 });
SeoShadowComparisonSchema.index({ 'verdict.winner': 1, createdAt: -1 });

export default models.SeoShadowComparison || model('SeoShadowComparison', SeoShadowComparisonSchema);

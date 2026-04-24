/**
 * models/SeoPredictionOutcome.ts
 *
 * Stores what ACTUALLY happened after an action, compared to what was predicted.
 * Contains error metrics and calibration signals.
 */

import { Schema, model, models } from 'mongoose';

const SeoPredictionOutcomeSchema = new Schema({
  predictionId: { type: Schema.Types.ObjectId, ref: 'SeoPredictionRecord', required: true, index: true },
  action:       { type: String, required: true, index: true },

  actual: {
    recoveredPages: { type: Number, default: 0 },
    improvedPages:  { type: Number, default: 0 },
    publishedPages: { type: Number, default: 0 },
    indexLiftPages: { type: Number, default: 0 },
  },

  predicted: {
    expectedRecovery:  { type: Number, default: 0 },
    expectedGrowth:    { type: Number, default: 0 },
    expectedIndexLift: { type: Number, default: 0 },
    confidence:        { type: Number, default: 0 },
  },

  error: {
    recoveryError:  { type: Number, default: 0 },
    growthError:    { type: Number, default: 0 },
    indexLiftError: { type: Number, default: 0 },
    absoluteError:  { type: Number, default: 0 },
  },

  calibration: {
    overPredicted:  { type: Boolean, default: false },
    underPredicted: { type: Boolean, default: false },
    accuracyScore:  { type: Number, default: 0 },
    bias:           { type: Number, default: 0 },
  },
}, { timestamps: true });

SeoPredictionOutcomeSchema.index({ createdAt: -1 });
SeoPredictionOutcomeSchema.index({ action: 1, createdAt: -1 });

export default models.SeoPredictionOutcome || model('SeoPredictionOutcome', SeoPredictionOutcomeSchema);

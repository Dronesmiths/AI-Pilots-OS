/**
 * models/SeoCalibrationState.ts
 *
 * Per-action calibration state at global, campaign, and user scope.
 * Tracks running error averages and adapts the confidence multiplier.
 * Higher samples → more reliable multiplier.
 */

import { Schema, model, models } from 'mongoose';

const ActionCalibrationSchema = new Schema({
  action:               { type: String, required: true },
  samples:              { type: Number, default: 0 },
  avgAbsoluteError:     { type: Number, default: 0 },
  bias:                 { type: Number, default: 0 },       // positive = over-predicting
  confidenceMultiplier: { type: Number, default: 1.0 },     // applied to raw prediction
}, { _id: false });

const DEFAULT_ACTIONS = ['boost','reinforce','internal_links','publish'].map(action => ({
  action, samples: 0, avgAbsoluteError: 0, bias: 0, confidenceMultiplier: 1.0,
}));

const SeoCalibrationStateSchema = new Schema({
  scopeType: { type: String, enum: ['global','campaign','user'], required: true, index: true },
  scopeId:   { type: String, required: true, index: true },
  actions:   { type: [ActionCalibrationSchema], default: () => DEFAULT_ACTIONS },
}, { timestamps: true });

SeoCalibrationStateSchema.index({ scopeType: 1, scopeId: 1 }, { unique: true });

export default models.SeoCalibrationState || model('SeoCalibrationState', SeoCalibrationStateSchema);

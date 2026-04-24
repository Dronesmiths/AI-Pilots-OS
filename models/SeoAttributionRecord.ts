/**
 * models/SeoAttributionRecord.ts
 *
 * Stores a structured causal attribution estimate for each evaluated prediction.
 * Does NOT claim perfect causality — classifies likelihood: high/medium/low/confounded/insufficient_data.
 * Created after SeoPredictionOutcome exists for a prediction.
 */

import { Schema, model, models } from 'mongoose';

const SeoAttributionRecordSchema = new Schema({
  predictionId: { type: Schema.Types.ObjectId, ref: 'SeoPredictionRecord', required: true, index: true },
  outcomeId:    { type: Schema.Types.ObjectId, ref: 'SeoPredictionOutcome', required: true, index: true },

  sourceType: { type: String, enum: ['simulation','optimizer','campaign','command'], required: true, index: true },
  mode:       { type: String, enum: ['live','shadow'], required: true, index: true },

  userId:     { type: Schema.Types.ObjectId, ref: 'User',        default: null, index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'SeoCampaign', default: null, index: true },
  goalId:     { type: Schema.Types.ObjectId, ref: 'SeoGoal',     default: null, index: true },

  action: { type: String, required: true, index: true },
  target: { type: String, default: '' },

  observed: {
    recoveredPages: { type: Number, default: 0 },
    improvedPages:  { type: Number, default: 0 },
    publishedPages: { type: Number, default: 0 },
    indexLiftPages: { type: Number, default: 0 },
  },

  context: {
    concurrentActions: { type: Number, default: 0 },
    activeCampaigns:   { type: Number, default: 0 },
    queueLoad:         { type: Number, default: 0 },
    pendingApprovals:  { type: Number, default: 0 },
  },

  attribution: {
    likelihood: {
      type: String,
      enum: ['high_likelihood','medium_likelihood','low_likelihood','confounded','insufficient_data'],
      default: 'insufficient_data', index: true,
    },
    score:       { type: Number, default: 0 },
    confounders: { type: [String], default: [] },
    explanation: { type: String, default: '' },
  },
}, { timestamps: true });

SeoAttributionRecordSchema.index({ mode: 1, action: 1, createdAt: -1 });
SeoAttributionRecordSchema.index({ 'attribution.likelihood': 1, createdAt: -1 });

export default models.SeoAttributionRecord || model('SeoAttributionRecord', SeoAttributionRecordSchema);

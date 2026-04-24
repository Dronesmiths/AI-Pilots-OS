/**
 * models/SeoPredictionRecord.ts
 *
 * Stores what the system expected BEFORE an action was executed.
 * Evaluated after `evaluationHours` to compare vs what actually happened.
 * Core of the closed-loop learning pipeline.
 */

import { Schema, model, models } from 'mongoose';

const SeoPredictionRecordSchema = new Schema({
  sourceType: {
    type: String,
    enum: ['simulation', 'optimizer', 'campaign', 'command'],
    required: true, index: true,
  },
  sourceId: { type: String, required: true, index: true },

  // 'shadow' = decision pipeline ran but nothing executed
  // 'live'   = command actually fired
  mode:          { type: String, enum: ['live', 'shadow'], default: 'live', index: true },
  comparisonKey: { type: String, default: '', index: true },   // shared key for shadow⟷live pairing

  goalId:     { type: Schema.Types.ObjectId, ref: 'SeoGoal',     default: null, index: true },
  campaignId: { type: Schema.Types.ObjectId, ref: 'SeoCampaign', default: null, index: true },
  userId:     { type: Schema.Types.ObjectId, ref: 'User',         default: null, index: true },

  action: {
    type: String,
    enum: ['boost','reinforce','internal_links','publish','enhance','rebuild'],
    required: true, index: true,
  },
  target:            { type: String, default: '' },
  allocatedCommands: { type: Number, default: 0  },

  predicted: {
    expectedRecovery:  { type: Number, default: 0 },
    expectedGrowth:    { type: Number, default: 0 },
    expectedIndexLift: { type: Number, default: 0 },
    confidence:        { type: Number, default: 0 },
  },

  baseline: {
    stuck6:           { type: Number, default: 0 },
    healthyIndexed:   { type: Number, default: 0 },
    published:        { type: Number, default: 0 },
    internalLinksWeak:{ type: Number, default: 0 },
  },

  evaluation: {
    dueAt:       { type: Date,   required: true, index: true },
    evaluatedAt: { type: Date,   default: null },
    status:      { type: String, enum: ['pending','evaluated','expired'], default: 'pending', index: true },
  },
}, { timestamps: true });

SeoPredictionRecordSchema.index({ 'evaluation.status': 1, 'evaluation.dueAt': 1 });

export default models.SeoPredictionRecord || model('SeoPredictionRecord', SeoPredictionRecordSchema);

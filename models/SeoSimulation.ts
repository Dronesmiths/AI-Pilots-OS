/**
 * models/SeoSimulation.ts
 *
 * Records a full scenario simulation run — what the system predicted
 * would happen across each goal if executed. Never mutates state.
 */

import { Schema, model, models } from 'mongoose';

const ScenarioResultSchema = new Schema({
  goalId:            Schema.Types.ObjectId,
  goalName:          String,
  action:            String,
  target:            String,
  allocatedCommands: Number,
  predictedImpact: {
    expectedRecovery: Number,
    expectedGrowth:   Number,
    expectedIndexLift:Number,
    confidence:       Number,
  },
  explanation: String,
}, { _id: false });

const SeoSimulationSchema = new Schema({
  name:  { type: String, required: true },
  mode:  { type: String, enum: ['shadow', 'scenario'], default: 'scenario' },

  totalCommandBudget: Number,
  results: { type: [ScenarioResultSchema], default: [] },

  summary: {
    totalPredictedRecovery: Number,
    totalPredictedGrowth:   Number,
    totalPredictedIndexLift:Number,
    avgConfidence:          Number,
  },
}, { timestamps: true });

SeoSimulationSchema.index({ createdAt: -1 });

export default models.SeoSimulation || model('SeoSimulation', SeoSimulationSchema);

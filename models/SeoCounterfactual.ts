/**
 * models/SeoCounterfactual.ts
 *
 * For each evaluated prediction, stores what the system predicted for alternative actions.
 * Quantifies "missed opportunity" — how much better a different action might have done.
 */

import { Schema, model, models } from 'mongoose';

const ScenarioSchema = new Schema({
  action:     String,
  target:     String,
  allocation: Number,
  predictedImpact: {
    expectedRecovery:  Number,
    expectedGrowth:    Number,
    expectedIndexLift: Number,
    confidence:        Number,
  },
}, { _id: false });

const SeoCounterfactualSchema = new Schema({
  predictionId: { type: Schema.Types.ObjectId, ref: 'SeaPredictionRecord', required: true, index: true },

  actualAction: String,
  actualOutcome: {
    recoveredPages: Number,
    improvedPages:  Number,
    indexLiftPages: Number,
  },

  alternatives: { type: [ScenarioSchema], default: [] },

  bestAlternative: {
    action: String,
    score:  Number,
  },

  missedOpportunity: {
    scoreDelta:  Number,
    explanation: String,
  },
}, { timestamps: true });

SeoCounterfactualSchema.index({ predictionId: 1 }, { unique: true });
SeoCounterfactualSchema.index({ 'missedOpportunity.scoreDelta': -1 });
SeoCounterfactualSchema.index({ createdAt: -1 });

export default models.SeoCounterfactual || model('SeoCounterfactual', SeoCounterfactualSchema);

/**
 * models/governance/PromotionRubricVersion.ts
 *
 * Versioned promotion scorecard rubric.
 * Each version stores the exact weights + gates that drive scoring.
 * status: active | previous | shadow | deprecated
 *
 * v1 is seeded with default weights. Adaptive tuning creates shadow versions
 * and human-gates promotion to live (via shouldPromoteAdaptiveRubric).
 *
 * Safety invariants stored here:
 *   - harmfulDeltaMax   — safety gate threshold, never removed by tuning
 *   - confidenceFloor   — minimum attribution confidence required
 *   - minSampleSize     — minimum evidence floor
 */
import mongoose, { Schema } from 'mongoose';

const PromotionRubricVersionSchema = new Schema({
  versionNumber: { type: Number, unique: true, required: true },

  weights: {
    reward:         { type: Number, required: true, min: 0, max: 0.50 },
    counterfactual: { type: Number, required: true, min: 0, max: 0.40 },
    causal:         { type: Number, required: true, min: 0, max: 0.50 },
    safety:         { type: Number, required: true, min: 0.10, max: 0.40 }, // safety hard floor
    confidence:     { type: Number, required: true, min: 0.05, max: 0.25 },
  },

  gates: {
    confidenceFloor: { type: Number, default: 0.70 },
    harmfulDeltaMax: { type: Number, default: 0.03 },
    minSampleSize:   { type: Number, default: 15 },
  },

  lifecycle: {
    status:         { type: String, default: 'shadow', enum: ['active','previous','shadow','deprecated'] },
    activatedAt:    { type: Date },
    deactivatedAt:  { type: Date },
  },

  source: { type: String, default: 'manual', enum: ['manual','adaptive_tuning'] },

  // Shadow evaluation results (populated by evaluateRubricWeights)
  shadowEvaluation: {
    casesEvaluated:    { type: Number, default: 0 },
    shadowWinRate:     { type: Number, default: 0 },
    rollbackRiskDelta: { type: Number, default: 0 },
    evaluatedAt:       { type: Date },
  },
}, { timestamps: true });

export default mongoose.models.PromotionRubricVersion ||
  mongoose.model('PromotionRubricVersion', PromotionRubricVersionSchema);

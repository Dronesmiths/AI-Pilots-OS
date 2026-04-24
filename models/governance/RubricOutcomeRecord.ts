/**
 * models/governance/RubricOutcomeRecord.ts
 *
 * Training corpus for adaptive rubric tuning.
 * Created when a promotion review completes AND the bandit later generates
 * enough post-decision attribution data to evaluate actual outcome.
 *
 * Also stores shadow rubric comparison (consolidates ShadowRubricEvaluation):
 *   shadowRubricVersionId   — which shadow rubric was being evaluated
 *   shadowScore/recommendation — what the shadow would have decided
 *   shadowAgreed            — did shadow rubric agree with live rubric?
 *   shadowWouldHaveBeenBetter — was shadow's decision directionally correct?
 */
import mongoose, { Schema } from 'mongoose';

const RubricOutcomeRecordSchema = new Schema({
  reviewCaseId:    { type: String, index: true, required: true },
  rubricVersionId: { type: String, index: true, required: true },

  features: {
    rewardSignal:      { type: Number, default: 0 },
    counterfactualLift:{ type: Number, default: 0 },
    causalDelta:       { type: Number, default: 0 },
    harmfulDelta:      { type: Number, default: 0 },
    confidence:        { type: Number, default: 0 },
    sampleSize:        { type: Number, default: 0 },
  },

  decision: {
    score:          { type: Number, default: 0 },
    recommendation: { type: String, required: true },
    approved:       { type: Boolean, default: false },
  },

  observedOutcome: {
    improved:                 { type: Boolean, default: false },
    degraded:                 { type: Boolean, default: false },
    rolledBack:               { type: Boolean, default: false },
    postPromotionCausalDelta: { type: Number, default: 0 },
    observedAt:               { type: Date },
  },

  // Shadow rubric comparison (consolidated from ShadowRubricEvaluation)
  shadowComparison: {
    shadowRubricVersionId:    { type: String, default: '' },
    shadowScore:              { type: Number, default: 0 },
    shadowRecommendation:     { type: String, default: '' },
    shadowAgreed:             { type: Boolean, default: false },
    shadowWouldHaveBeenBetter:{ type: Boolean, default: false },
  },
}, { timestamps: true });

RubricOutcomeRecordSchema.index({ rubricVersionId: 1, 'observedOutcome.improved': 1 });

export default mongoose.models.RubricOutcomeRecord ||
  mongoose.model('RubricOutcomeRecord', RubricOutcomeRecordSchema);

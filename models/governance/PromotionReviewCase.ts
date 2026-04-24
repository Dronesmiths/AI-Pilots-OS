/**
 * models/governance/PromotionReviewCase.ts
 *
 * Unified governed promotion review object.
 * Embeds all evidence layers in one document so the console never needs joins:
 *   rewardEvidence        — live vs shadow arm signal
 *   causalEvidence        — before/after ArmCausalAttribution windows
 *   governanceEvidence    — harm rate, rollback risk, sample size, founder-safe
 *   scorecard             — weighted breakdown + gates + 0–1 totalScore
 *   verdict               — governed recommendation + narrative
 *   review                — admin action state
 *
 * Replaces the need for separate:
 *   PromotionCausalComparison (embedded in causalEvidence)
 *   PromotionScorecard        (embedded in scorecard)
 */
import mongoose, { Schema } from 'mongoose';

const windowSchema = new Schema({
  start:                    { type: Date },
  end:                      { type: Date },
  avgCausalScore:           { type: Number, default: 0 },
  confidenceWeightedScore:  { type: Number, default: 0 },
  harmfulCausalRate:        { type: Number, default: 0 },
  avgAttributionConfidence: { type: Number, default: 0 },
  topArmId:                 { type: String, default: '' },
  sampleSize:               { type: Number, default: 0 },
}, { _id: false });

const PromotionReviewCaseSchema = new Schema({
  banditId: { type: String, index: true, required: true, unique: true },

  context: {
    anomalyType: { type: String, required: true },
    contextKey:  { type: String, required: true },
  },

  source: {
    candidateType: { type: String, default: 'causal_shadow_reward_mode' },
    candidateId:   { type: String, default: '' },
    fromVersionId: { type: String, default: '' },
    toVersionId:   { type: String, default: '' },
  },

  rewardEvidence: {
    liveLeader:       { type: String, default: '' },
    shadowLeader:     { type: String, default: '' },
    disagreementRate: { type: Number, default: 0 },
    shadowAdvantage:  { type: Number, default: 0 },
    avgConfidence:    { type: Number, default: 0 },
    totalShadowPulls: { type: Number, default: 0 },
  },

  causalEvidence: {
    before:       { type: windowSchema, default: {} },
    after:        { type: windowSchema, default: {} },
    causalVerdict:{ type: String, default: 'observing', enum: ['observing','improved','neutral','degraded'] },
    delta: {
      causalScoreDelta:           { type: Number, default: 0 },
      confidenceWeightedDelta:    { type: Number, default: 0 },
      harmfulCausalDelta:         { type: Number, default: 0 },
      attributionConfidenceDelta: { type: Number, default: 0 },
    },
  },

  governanceEvidence: {
    sampleSize:   { type: Number, default: 0 },
    harmfulRate:  { type: Number, default: 0 },
    harmfulDelta: { type: Number, default: 0 },
    rollbackRisk: { type: Number, default: 0 },
    founderSafe:  { type: Boolean, default: true },
  },

  // Embedded scorecard — avoids join for every table row
  scorecard: {
    weights: {
      reward:          { type: Number, default: 0.25 },
      counterfactual:  { type: Number, default: 0.20 },
      causal:          { type: Number, default: 0.30 },
      safety:          { type: Number, default: 0.15 },
      confidence:      { type: Number, default: 0.10 },
    },
    breakdown: {
      reward:          { type: Number, default: 0 },
      counterfactual:  { type: Number, default: 0 },
      causal:          { type: Number, default: 0 },
      safety:          { type: Number, default: 0 },
      confidence:      { type: Number, default: 0 },
    },
    totalScore:  { type: Number, default: 0 }, // 0–1
    gates: {
      safetyPass:     { type: Boolean, default: false },
      confidencePass: { type: Boolean, default: false },
      samplePass:     { type: Boolean, default: false },
    },
    rubricVersionId: { type: String, default: '' },
  },

  verdict: {
    recommendation: { type: String, default: 'observe', enum: ['approve','approve_cautious','keep_shadow','reject','rollback_candidate','observe'] },
    confidence:     { type: Number, default: 0 },
    summary:        { type: String, default: '' },
    notes:          [String],
  },

  review: {
    status:     { type: String, default: 'pending', enum: ['pending','approved','approved_cautious','rejected','kept_shadow','rolled_back'] },
    reviewedBy: { type: String, default: '' },
    reviewedAt: { type: Date },
    notes:      { type: String, default: '' },
  },
}, { timestamps: true });

PromotionReviewCaseSchema.index({ 'verdict.recommendation': 1 });
PromotionReviewCaseSchema.index({ 'review.status': 1 });
PromotionReviewCaseSchema.index({ 'scorecard.totalScore': -1 });

export default mongoose.models.PromotionReviewCase ||
  mongoose.model('PromotionReviewCase', PromotionReviewCaseSchema);

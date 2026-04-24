/**
 * models/governance/ArmCausalAttribution.ts
 *
 * Per-pull causal attribution record.
 * Answers: how much of the observed outcome is attributable to this arm
 * vs. what would likely have happened under similar conditions with a different arm?
 *
 * Method: matched comparator quasi-experiment using same-context pulls as control group.
 */
import mongoose, { Schema } from 'mongoose';

const ArmCausalAttributionSchema = new Schema({
  banditPullId: { type: String, index: true, required: true, unique: true },
  banditId:     { type: String, index: true, required: true },
  armId:        { type: String, index: true, required: true },
  operatorId:   { type: String, index: true, required: true },
  anomalyId:    { type: String, index: true, required: true },

  context: {
    anomalyType:     { type: String, required: true },
    trustBand:       { type: String, default: '' },
    severityBand:    { type: String, default: '' },
    contextKey:      { type: String, default: '' },
  },

  observedOutcome: {
    effectivenessScore:   { type: Number, default: 0 },
    counterfactualImpact: { type: Number, default: 0 },
    harmful:              { type: Boolean, default: false },
  },

  comparatorEstimate: {
    avgEffectiveness:      { type: Number, default: 0 },
    avgCounterfactualImpact: { type: Number, default: 0 },
    harmfulRate:           { type: Number, default: 0 },
    sampleSize:            { type: Number, default: 0 },
  },

  causalImpact: {
    trustContribution:            { type: Number, default: 0 },
    eventReductionContribution:   { type: Number, default: 0 },
    anomalyResolutionContribution:{ type: Number, default: 0 },
    overallCausalScore:           { type: Number, default: 0 }, // −1 → +1
  },

  confidence: {
    score:  { type: Number, default: 0 },
    method: { type: String, default: 'matched_comparison' },
    notes:  [String],
  },
}, { timestamps: true });

ArmCausalAttributionSchema.index({ armId: 1, createdAt: -1 });
ArmCausalAttributionSchema.index({ context_anomalyType: 1, 'causalImpact.overallCausalScore': -1 });

export default mongoose.models.ArmCausalAttribution ||
  mongoose.model('ArmCausalAttribution', ArmCausalAttributionSchema);

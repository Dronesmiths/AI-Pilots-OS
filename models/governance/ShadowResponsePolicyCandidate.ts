/**
 * models/governance/ShadowResponsePolicyCandidate.ts
 *
 * A proposed change to a response policy, generated from effectiveness +
 * counterfactual evidence. Lives in shadow until human-approved promotion.
 *
 * Status flow:
 *   shadow_pending → shadow_active → shadow_success → promoted
 *                                  → shadow_failed  → rejected
 *                                  (or)               rejected (manual)
 */
import mongoose, { Schema } from 'mongoose';

const ShadowResponsePolicyCandidateSchema = new Schema({
  anomalyType: { type: String, index: true, required: true },
  scope:       { type: String, default: 'global' },
  scopeKey:    { type: String, default: 'global' },

  currentPolicy: {
    defaultResponse:    { type: String, required: true },
    maxDurationMinutes: { type: Number, required: true },
    severityRule:       { type: String, default: '' },
  },

  candidatePolicy: {
    defaultResponse:    { type: String, required: true },
    maxDurationMinutes: { type: Number, required: true },
    severityRule:       { type: String, default: '' },
  },

  evidence: {
    sampleSize:                   { type: Number, default: 0 },
    avgCounterfactualImpactLift:  { type: Number, default: 0 },
    avgObservedEffectivenessLift: { type: Number, default: 0 },
    confidence:                   { type: Number, default: 0 },
  },

  evaluation: {
    status: {
      type: String, default: 'shadow_pending',
      enum: ['shadow_pending', 'shadow_active', 'shadow_success', 'shadow_failed', 'promoted', 'rejected'],
    },
    startedAt:   { type: Date },
    completedAt: { type: Date },
    notes:       [{ type: String }],
  },

  harmSignals: {
    harmfulCaseCount: { type: Number, default: 0 },
    lastHarmAt:       { type: Date },
  },
}, { timestamps: true });

ShadowResponsePolicyCandidateSchema.index({ anomalyType: 1, 'evaluation.status': 1 });

export default mongoose.models.ShadowResponsePolicyCandidate ||
  mongoose.model('ShadowResponsePolicyCandidate', ShadowResponsePolicyCandidateSchema);

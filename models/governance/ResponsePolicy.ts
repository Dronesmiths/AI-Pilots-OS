/**
 * models/governance/ResponsePolicy.ts
 *
 * Persistable, promotable response policy record.
 *
 * The code-level getBoundedResponsePolicy() provides safe defaults.
 * When a shadow policy is promoted, a new ResponsePolicy record is created
 * and the previous one is deactivated — giving a full version history.
 *
 * The live policy resolver checks this collection first, falls back to the
 * coded defaults if no active record exists for an anomaly type.
 */
import mongoose, { Schema } from 'mongoose';

const ResponsePolicySchema = new Schema({
  anomalyType: { type: String, index: true, required: true },
  scope:       { type: String, default: 'global', enum: ['global', 'trust_band', 'tenant'] },
  scopeKey:    { type: String, default: 'global' },

  policy: {
    defaultResponse:    { type: String, required: true },
    allowedResponses:   [{ type: String }],
    maxDurationMinutes: { type: Number, required: true },
    severityRule:       { type: String, default: '' },
  },

  lifecycle: {
    active:  { type: Boolean, default: true },
    version: { type: Number, default: 1 },
    source:  {
      type: String, default: 'manual',
      enum: ['manual', 'promoted_shadow_policy', 'seed'],
    },
    promotedFrom: { type: String, default: '' }, // candidateId if from shadow promotion
  },
}, { timestamps: true });

ResponsePolicySchema.index({ anomalyType: 1, scope: 1, scopeKey: 1, 'lifecycle.active': 1 });

export default mongoose.models.ResponsePolicy ||
  mongoose.model('ResponsePolicy', ResponsePolicySchema);

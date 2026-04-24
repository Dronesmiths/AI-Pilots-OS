/**
 * models/governance/OperatorControlState.ts
 *
 * Temporary authority restriction — created by bbox-response system,
 * expiry is automatic (TTL on clearedAt) and all actions are reversible.
 *
 * Design: does NOT mutate delegation grants.
 * The command flow reads active ControlStates at runtime and layers
 * them on top of the real grant. When a control expires, the grant's
 * authority is immediately restored — no restore script needed.
 *
 * controlType values:
 *   watch_mode                — visibility-only, no execution changes
 *   tighten_one_level         — command flow treats operator as one level lower
 *   require_low_risk_approval — even low-risk commands need approval gate
 *   probation_short           — all execution requires approval (max 12h)
 *   freeze_delegation_expansion — prevents trust engine from expanding delegation
 */
import mongoose, { Schema } from 'mongoose';

const LifecycleSchema = new Schema({
  startedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  clearedAt: { type: Date },
}, { _id: false });

const OperatorControlStateSchema = new Schema({
  tenantId:   { type: String, index: true, required: true },
  operatorId: { type: String, index: true, required: true },

  controlType: {
    type: String, index: true, required: true,
    enum: [
      'watch_mode',
      'tighten_one_level',
      'require_low_risk_approval',
      'probation_short',
      'freeze_delegation_expansion',
    ],
  },

  reason:  { type: String, required: true },
  source:  {
    type: String, default: 'anomaly_auto_response',
    enum: ['anomaly_auto_response', 'manual', 'founder_override'],
  },

  relatedAnomalyId: { type: String, index: true, default: '' },
  active:           { type: Boolean, default: true, index: true },
  lifecycle:        { type: LifecycleSchema, required: true },

}, { timestamps: true });

// Primary query index (most common lookup)
OperatorControlStateSchema.index({ tenantId: 1, operatorId: 1, active: 1 });
// Expiry sweep index
OperatorControlStateSchema.index({ active: 1, 'lifecycle.expiresAt': 1 });
// Named-type dedup index
OperatorControlStateSchema.index({ tenantId: 1, operatorId: 1, controlType: 1, active: 1 });

// Auto-purge cleared/expired records after 30 days
OperatorControlStateSchema.index(
  { 'lifecycle.clearedAt': 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60,
    partialFilterExpression: { active: false, 'lifecycle.clearedAt': { $exists: true } },
  }
);

export default mongoose.models.OperatorControlState ||
  mongoose.model('OperatorControlState', OperatorControlStateSchema);

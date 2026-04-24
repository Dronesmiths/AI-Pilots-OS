/**
 * models/governance/PolicyTuningAuditLog.ts
 *
 * Immutable audit trail for every policy tuning decision.
 * Every create / promote / reject action creates a new entry — never updated.
 */
import mongoose, { Schema } from 'mongoose';

const PolicyTuningAuditLogSchema = new Schema({
  candidateId: { type: String, index: true, required: true },
  action: {
    type: String, required: true,
    enum: ['created', 'shadow_started', 'evidence_updated', 'promoted', 'rejected'],
  },
  summary:  { type: String, required: true },
  evidence: {
    sampleSize:    { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0 },
    avgLift:       { type: Number, default: 0 },
  },
  notes: [{ type: String }],
}, { timestamps: true });

export default mongoose.models.PolicyTuningAuditLog ||
  mongoose.model('PolicyTuningAuditLog', PolicyTuningAuditLogSchema);

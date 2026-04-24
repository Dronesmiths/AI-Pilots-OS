/**
 * models/governance/RubricTuningAuditLog.ts
 * Immutable record of every rubric version lifecycle event.
 */
import mongoose, { Schema } from 'mongoose';

const RubricTuningAuditLogSchema = new Schema({
  fromVersionId: { type: String, index: true, required: true },
  toVersionId:   { type: String, index: true, required: true },
  action:        { type: String, required: true, enum: ['created_shadow','promoted','rejected','rolled_back'] },
  performedBy:   { type: String, default: 'system' },
  summary:       { type: String, required: true },
  evidence: {
    casesEvaluated:    { type: Number, default: 0 },
    shadowWinRate:     { type: Number, default: 0 },
    rollbackRiskDelta: { type: Number, default: 0 },
  },
}, { timestamps: true });

export default mongoose.models.RubricTuningAuditLog ||
  mongoose.model('RubricTuningAuditLog', RubricTuningAuditLogSchema);

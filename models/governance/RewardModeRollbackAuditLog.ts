/**
 * models/governance/RewardModeRollbackAuditLog.ts
 * Immutable record of every rollback execution.
 */
import mongoose, { Schema } from 'mongoose';

const RewardModeRollbackAuditLogSchema = new Schema({
  banditId:      { type: String, index: true, required: true },
  fromVersionId: { type: String, index: true, required: true },
  toVersionId:   { type: String, index: true, required: true },
  reason:        { type: String, required: true },
  rolledBackBy:  { type: String, default: 'system' },

  evidence: {
    rewardDelta:      { type: Number, default: 0 },
    harmfulDelta:     { type: Number, default: 0 },
    disagreementDelta:{ type: Number, default: 0 },
  },
}, { timestamps: true });

export default mongoose.models.RewardModeRollbackAuditLog ||
  mongoose.model('RewardModeRollbackAuditLog', RewardModeRollbackAuditLogSchema);

/**
 * models/governance/ContextualBanditMergeAuditLog.ts
 *
 * Append-only immutable record of every merge execution.
 * Created by mergeContextualBanditIntoGlobal() — never updated.
 */
import mongoose, { Schema } from 'mongoose';

const ContextualBanditMergeAuditLogSchema = new Schema({
  contextualBanditId: { type: String, index: true, required: true },
  globalBanditId:     { type: String, index: true, required: true },
  contextKey:         { type: String, index: true, required: true },

  reason:    { type: String, required: true },
  mergedBy:  { type: String, default: 'system' }, // 'system' | adminUserId

  evidence: {
    rewardDelta:  { type: Number, default: 0 },
    harmDelta:    { type: Number, default: 0 },
    sameTopArm:   { type: Boolean, default: false },
    totalPulls:   { type: Number, default: 0 },
    signalCount:  { type: Number, default: 0 },
  },
}, { timestamps: true });

ContextualBanditMergeAuditLogSchema.index({ contextKey: 1, createdAt: -1 });

export default mongoose.models.ContextualBanditMergeAuditLog ||
  mongoose.model('ContextualBanditMergeAuditLog', ContextualBanditMergeAuditLogSchema);

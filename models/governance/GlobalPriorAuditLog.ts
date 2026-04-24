/**
 * models/governance/GlobalPriorAuditLog.ts
 * Append-only log of all GlobalArmPrior state changes.
 */
import mongoose, { Schema } from 'mongoose';

const GlobalPriorAuditLogSchema = new Schema({
  responseType: { type: String, index: true, required: true },
  scopeKey:     { type: String, index: true, required: true },

  action: { type: String, required: true, enum: ['created','updated','degraded','deprecated','restored'] },

  before: { type: Schema.Types.Mixed, default: {} },
  after:  { type: Schema.Types.Mixed, default: {} },
  reason: { type: String, default: '' },
}, { timestamps: true });

GlobalPriorAuditLogSchema.index({ responseType: 1, createdAt: -1 });

export default mongoose.models.GlobalPriorAuditLog ||
  mongoose.model('GlobalPriorAuditLog', GlobalPriorAuditLogSchema);

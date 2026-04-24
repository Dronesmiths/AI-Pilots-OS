/**
 * models/governance/PromotionConsoleAuditLog.ts
 * Immutable record of every action taken in the unified promotion console.
 */
import mongoose, { Schema } from 'mongoose';

const PromotionConsoleAuditLogSchema = new Schema({
  reviewCaseId: { type: String, index: true, required: true },
  banditId:     { type: String, index: true, required: true },

  action:      { type: String, required: true, enum: ['approved','approved_cautious','kept_shadow','rejected','rolled_back','rebuilt'] },
  performedBy: { type: String, default: 'admin' },
  notes:       { type: String, default: '' },

  scoreSummary: {
    totalScore:     { type: Number },
    recommendation: { type: String },
  },
}, { timestamps: true });

PromotionConsoleAuditLogSchema.index({ banditId: 1, createdAt: -1 });

export default mongoose.models.PromotionConsoleAuditLog ||
  mongoose.model('PromotionConsoleAuditLog', PromotionConsoleAuditLogSchema);

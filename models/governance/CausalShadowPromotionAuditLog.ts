/**
 * models/governance/CausalShadowPromotionAuditLog.ts
 * Append-only record of every promotion, rejection, or keep-shadow decision.
 */
import mongoose, { Schema } from 'mongoose';

const CausalShadowPromotionAuditLogSchema = new Schema({
  banditId:    { type: String, index: true, required: true },
  candidateId: { type: String, index: true },
  action:      { type: String, required: true, enum: ['promoted','rejected','keep_shadow','paused','rolled_back'] },
  changedBy:   { type: String, default: 'system' },
  notes:       { type: String, default: '' },
  before:      { type: Schema.Types.Mixed, default: {} },
  after:       { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

CausalShadowPromotionAuditLogSchema.index({ banditId: 1, createdAt: -1 });

export default mongoose.models.CausalShadowPromotionAuditLog ||
  mongoose.model('CausalShadowPromotionAuditLog', CausalShadowPromotionAuditLogSchema);

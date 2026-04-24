/**
 * models/governance/BanditRolloutAuditLog.ts
 *
 * Append-only audit trail for all bandit operational changes:
 *   rollout_mode_changed | arm_disabled | arm_enabled | bandit_paused | bandit_resumed
 *
 * Every entry captures before/after state so rollback decisions are always
 * informed by what was true before the change.
 */
import mongoose, { Schema } from 'mongoose';

const BanditRolloutAuditLogSchema = new Schema({
  banditId: { type: String, index: true, required: true },

  action: {
    type: String, required: true,
    enum: ['rollout_mode_changed', 'arm_disabled', 'arm_enabled', 'bandit_paused', 'bandit_resumed', 'contextual_spawned'],
  },

  before: { type: Schema.Types.Mixed, default: {} },
  after:  { type: Schema.Types.Mixed, default: {} },

  changedBy: { type: String, default: 'system' }, // 'system' | adminUserId
  notes:     { type: String, default: '' },
}, { timestamps: true });

BanditRolloutAuditLogSchema.index({ banditId: 1, createdAt: -1 });

export default mongoose.models.BanditRolloutAuditLog ||
  mongoose.model('BanditRolloutAuditLog', BanditRolloutAuditLogSchema);

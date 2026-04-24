/**
 * models/SeoAuditLog.ts
 *
 * Append-only audit trail for all consequential system actions.
 * Logs: commands executed, policy changes, overrides, approvals, failures, pauses.
 * Required for enterprise trust and debugging.
 */

import { Schema, model, models } from 'mongoose';

const SeoAuditLogSchema = new Schema({
  action: {
    type: String,
    enum: [
      'command_executed', 'command_blocked', 'command_dry_run',
      'policy_proposed', 'policy_promoted', 'policy_rejected',
      'job_approved', 'job_rejected',
      'optimizer_run', 'shadow_run', 'simulation_run',
      'system_paused', 'system_resumed',
      'evolution_cycle',
      'manual_override',
      'error',
    ],
    required: true, index: true,
  },

  userId:      { type: Schema.Types.ObjectId, ref: 'User',      default: null, index: true },
  workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
  goalId:      { type: Schema.Types.ObjectId, ref: 'SeoGoal',   default: null, index: true },
  campaignId:  { type: Schema.Types.ObjectId, ref: 'SeoCampaign', default: null, index: true },

  actor:       { type: String, enum: ['system','orchestrator','operator','api'], default: 'system' },
  severity:    { type: String, enum: ['info','warning','error'], default: 'info' },

  message:  { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

SeoAuditLogSchema.index({ createdAt: -1 });
SeoAuditLogSchema.index({ action: 1, createdAt: -1 });
SeoAuditLogSchema.index({ workspaceId: 1, createdAt: -1 });

export default models.SeoAuditLog || model('SeoAuditLog', SeoAuditLogSchema);

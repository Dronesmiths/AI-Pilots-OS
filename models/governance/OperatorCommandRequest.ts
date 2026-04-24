/**
 * models/governance/OperatorCommandRequest.ts
 *
 * The command envelope — records every human command submitted to the system.
 * Created at submit time. Status progresses from pending → approved/blocked → executed.
 *
 * requestKey: {operatorId}::{commandClass}::{Date.now()}
 *
 * commandMode classification:
 *   suggest   → advisory, non-forcing, shadow only
 *   override  → replaces system decision, requires grant
 *   force     → bypasses scoring, requires high trust
 *   emergency → system-wide effect, requires constitutional trust
 *
 * expiresAt: pending commands auto-expire if not resolved in time.
 */
import mongoose, { Schema, Model } from 'mongoose';

const COMMAND_CLASSES = [
  'planner_override', 'policy_override', 'champion_override',
  'rollback_rule', 'reopen_scope', 'promote_challenger',
  'pause_automation', 'resume_automation',
  'global_policy_change', 'emergency_shutdown',
];

const OperatorCommandRequestSchema = new Schema(
  {
    requestKey:  { type: String, required: true, unique: true, index: true },
    operatorId:  { type: String, required: true, index: true },
    tenantId:    { type: String, default: null,  index: true },
    scopeKey:    { type: String, default: null,  index: true },

    commandClass: { type: String, required: true, index: true, enum: COMMAND_CLASSES },

    commandMode: {
      type: String, required: true, index: true,
      enum: ['suggest', 'override', 'force', 'emergency'],
    },

    payload:         { type: Schema.Types.Mixed, required: true },
    commandRiskBand: { type: String, required: true, index: true, enum: ['low', 'medium', 'high'] },

    status: {
      type: String, default: 'pending', index: true,
      enum: ['pending', 'approved', 'blocked', 'executed', 'expired', 'rolled_back'],
    },

    governanceVerdict: {
      type: String, default: 'block', index: true,
      enum: ['allow', 'allow_shadow', 'approval_required', 'block'],
    },

    governanceReason: { type: String, default: '' },
    executedAt:       { type: Date, default: null },
    expiresAt:        { type: Date, default: null },
  },
  { timestamps: true }
);

OperatorCommandRequestSchema.index({ status: 1, createdAt: -1 });

const OperatorCommandRequest: Model<any> =
  mongoose.models.OperatorCommandRequest ||
  mongoose.model('OperatorCommandRequest', OperatorCommandRequestSchema);

export default OperatorCommandRequest;

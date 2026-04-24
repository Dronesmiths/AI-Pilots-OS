/**
 * models/audit/NovaOperatorAuditLog.ts
 *
 * Immutable audit trail of every operator action in the War Room and boardroom.
 * Written on: votes, applies, acknowledges, mitigations, overrides, rollbacks, config changes.
 *
 * actionKey: "audit::{operatorId}::{action}::{targetKey}::{timestamp_ms}"
 *   Unique per event — not deduplicated.
 *
 * Indexes:
 *   (operatorId, createdAt)  — per-operator history
 *   (targetType, targetKey)  — all actions on a specific object
 *   (action, createdAt)      — action frequency analysis
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type AuditAction =
  | 'vote.approve'
  | 'vote.reject'
  | 'resolution.apply'
  | 'alert.acknowledge'
  | 'alert.suppress'
  | 'alert.resolve'
  | 'mitigation.apply'
  | 'mitigation.revert'
  | 'protection.lift'
  | 'protection.set'
  | 'guardrail.config'
  | 'strategic_mode.set'
  | 'constitution.update'
  // Policy override actions (settings UI + onboarding)
  | 'policy.override'
  | 'policy.threshold.override'
  | 'policy.alert.override'
  | 'policy.mitigation.override'
  | 'policy.mandate.override'
  | 'policy.domain.override'
  | 'tenant.onboard'
  | 'tenant.create';

export interface NovaOperatorAuditLogDocument extends Document {
  actionKey:  string;
  operatorId: string;
  role:       string;
  action:     AuditAction;
  targetType: string;
  targetKey:  string;
  metadata?:  Record<string, unknown>;
  createdAt:  Date;
}

const NovaOperatorAuditLogSchema = new Schema<NovaOperatorAuditLogDocument>(
  {
    actionKey:  { type: String, required: true, unique: true, index: true },
    operatorId: { type: String, required: true, index: true },
    role:       { type: String, required: true },
    action:     { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetKey:  { type: String, required: true },
    metadata:   { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NovaOperatorAuditLogSchema.index({ operatorId: 1, createdAt: -1 });
NovaOperatorAuditLogSchema.index({ targetType: 1, targetKey: 1, createdAt: -1 });
NovaOperatorAuditLogSchema.index({ action: 1, createdAt: -1 });

export const NovaOperatorAuditLog: Model<NovaOperatorAuditLogDocument> =
  (mongoose.models.NovaOperatorAuditLog as Model<NovaOperatorAuditLogDocument>) ||
  mongoose.model<NovaOperatorAuditLogDocument>('NovaOperatorAuditLog', NovaOperatorAuditLogSchema);

// ─── Fire-and-forget helper ───────────────────────────────────────────────────
export async function logOperatorAction(params: {
  operatorId: string;
  role:       string;
  action:     AuditAction;
  targetType: string;
  targetKey:  string;
  metadata?:  Record<string, unknown>;
}) {
  const actionKey = `audit::${params.operatorId}::${params.action}::${params.targetKey}::${Date.now()}`;
  // Fire and forget — never block the operator action on audit write
  void NovaOperatorAuditLog.create({ ...params, actionKey }).catch(() => {});
}

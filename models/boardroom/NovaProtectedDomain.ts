/**
 * models/boardroom/NovaProtectedDomain.ts
 *
 * Explicit no-touch declarations for ventures, portfolios, or the global scope.
 * A protected domain is a scope that Nova must never autonomously mitigate without
 * human approval, a restricted action list, or both.
 *
 * blockedActions: [] means ALL mitigation actions are blocked.
 *   [specific types] means only those actions are blocked; others may proceed if
 *   the guardrail config and policy both allow it.
 *
 * canBeOverridden:
 *   false → mitigation is completely blocked — even with human approval the
 *           mitigation API will refuse unless the protection is lifted first.
 *   true  → mitigation requires human approval but CAN be applied by operator.
 *
 * requireHumanApproval: creates mitigation in 'proposed' status; auto-apply is skipped.
 *   Operator must click Apply in the War Room or call the mitigation API directly.
 *
 * domainKey: "protected::{scopeType}::{scopeKey}" — one active record per scope.
 * expiresAt: optional TTL. If set, runMitigationGuardrailMaintenance sets status='expired'.
 *
 * protectedBy: who or what created this protection.
 *   'operator'  → manually set in war room
 *   'doctrine'  → auto-generated from doctrine evolution outcome
 *   'mission'   → mission-critical override (highest priority)
 *   'cognition' → auto-set by Nova's own risk engine (lower priority, overridable)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { MitigationActionType } from './NovaMitigationAction';

export type ProtectedBySource = 'operator' | 'doctrine' | 'mission' | 'cognition';
export type ProtectedDomainStatus = 'active' | 'expired' | 'lifted';

export interface NovaProtectedDomainDocument extends Document {
  domainKey:             string;
  scopeType:             'venture' | 'portfolio' | 'global';
  scopeKey:              string;
  reason:                string;
  protectedBy:           ProtectedBySource;
  blockedActions:        MitigationActionType[];      // [] = ALL actions blocked
  canBeOverridden:       boolean;
  requireHumanApproval:  boolean;
  expiresAt?:            Date;
  status:                ProtectedDomainStatus;
  createdAt:             Date;
  updatedAt:             Date;
}

const NovaProtectedDomainSchema = new Schema<NovaProtectedDomainDocument>(
  {
    domainKey:        { type: String, required: true, unique: true, index: true },
    scopeType:        { type: String, enum: ['venture','portfolio','global'], required: true, index: true },
    scopeKey:         { type: String, required: true, index: true },
    reason:           { type: String, required: true },
    protectedBy:      { type: String, enum: ['operator','doctrine','mission','cognition'], required: true, index: true },
    blockedActions:   [{ type: String }],              // empty array = all actions blocked
    canBeOverridden:  { type: Boolean, default: true },
    requireHumanApproval: { type: Boolean, default: true },
    expiresAt:        { type: Date },
    status:           { type: String, enum: ['active','expired','lifted'], default: 'active', index: true },
  },
  { timestamps: true }
);

// War room panel: all active protections
NovaProtectedDomainSchema.index({ status: 1, protectedBy: 1 });
// Guardrail check: is this scopeKey protected?
NovaProtectedDomainSchema.index({ scopeKey: 1, status: 1 });

export const NovaProtectedDomain: Model<NovaProtectedDomainDocument> =
  (mongoose.models.NovaProtectedDomain as Model<NovaProtectedDomainDocument>) ||
  mongoose.model<NovaProtectedDomainDocument>('NovaProtectedDomain', NovaProtectedDomainSchema);

/**
 * models/boardroom/NovaGuardrailViolation.ts
 *
 * Immutable audit log of every guardrail check that produced a block,
 * require_approval, or warn result.
 *
 * violationKey: "violation::{actionType}::{scopeKey}::{timestamp_ms}"
 *   Unique to every check — violations are NOT deduplicated (each is a real event).
 *   This gives a full audit trail for compliance and pattern analysis.
 *
 * ruleKey: which constitution rule fired (null if the violation came from protected domain
 *   or guardrail config rather than a constitution rule).
 *
 * Indexes:
 *   (enforcement, createdAt) — violations feed sorted by severity then recency
 *   (scopeKey, createdAt)    — per-scope violation history
 *   (ruleKey, createdAt)     — per-rule firing frequency
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { ConstitutionEnforcement } from './NovaConstitution';

export interface NovaGuardrailViolationDocument extends Document {
  violationKey: string;
  actionType:   string;
  scopeType:    string;
  scopeKey:     string;
  reason:       string;
  enforcement:  ConstitutionEnforcement;
  ruleKey?:     string;
  payload?:     Record<string, unknown>;
  createdAt:    Date;
}

const NovaGuardrailViolationSchema = new Schema<NovaGuardrailViolationDocument>(
  {
    violationKey: { type: String, required: true, unique: true, index: true },
    actionType:   { type: String, required: true, index: true },
    scopeType:    { type: String, required: true },
    scopeKey:     { type: String, required: true, index: true },
    reason:       { type: String, required: true },
    enforcement:  { type: String, enum: ['block','require_approval','warn'], required: true, index: true },
    ruleKey:      { type: String, index: true },
    payload:      { type: Schema.Types.Mixed },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Violations feed: most recent blocks and approvals first
NovaGuardrailViolationSchema.index({ enforcement: 1, createdAt: -1 });
// Per-scope frequency analysis
NovaGuardrailViolationSchema.index({ scopeKey: 1, createdAt: -1 });
// Per-rule firing frequency (which rules are triggering most?)
NovaGuardrailViolationSchema.index({ ruleKey: 1, createdAt: -1 });

export const NovaGuardrailViolation: Model<NovaGuardrailViolationDocument> =
  (mongoose.models.NovaGuardrailViolation as Model<NovaGuardrailViolationDocument>) ||
  mongoose.model<NovaGuardrailViolationDocument>('NovaGuardrailViolation', NovaGuardrailViolationSchema);

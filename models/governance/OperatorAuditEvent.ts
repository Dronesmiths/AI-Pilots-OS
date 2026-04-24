/**
 * models/governance/OperatorAuditEvent.ts
 *
 * Immutable audit entry for every governance lifecycle event.
 * Never updated — append-only.
 *
 * auditKey: {requestKey}::{eventType}::{Date.now()}
 *
 * One requestKey can have multiple audit events:
 *   submitted → approved → executed
 *   submitted → blocked
 *   submitted → approved → executed → rolled_back
 *
 * This is the permanent human-governance trail enabling:
 *   blame clarity, rollback tracing, permission traceability, incident reconstruction.
 */
import mongoose, { Schema, Model } from 'mongoose';

const OperatorAuditEventSchema = new Schema(
  {
    auditKey:   { type: String, required: true, unique: true, index: true },
    operatorId: { type: String, required: true, index: true },
    requestKey: { type: String, required: true, index: true },
    tenantId:   { type: String, default: null,  index: true },
    scopeKey:   { type: String, default: null,  index: true },

    eventType: {
      type: String, required: true, index: true,
      enum: ['submitted', 'approved', 'blocked', 'executed', 'rolled_back', 'expired', 'emergency_invoked'],
    },

    commandClass: { type: String, required: true, index: true },
    commandMode:  { type: String, required: true, index: true },

    reasoning: { type: String, default: '' },
    metadata:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

OperatorAuditEventSchema.index({ operatorId: 1, createdAt: -1 });
OperatorAuditEventSchema.index({ requestKey: 1, eventType: 1 });

const OperatorAuditEvent: Model<any> =
  mongoose.models.OperatorAuditEvent ||
  mongoose.model('OperatorAuditEvent', OperatorAuditEventSchema);

export default OperatorAuditEvent;

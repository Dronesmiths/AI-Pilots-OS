/**
 * models/governance/DelegationAdjustmentLog.ts
 *
 * Immutable record of every delegation change (expansion, contraction, revocation).
 * Enables "why was this operator's authority changed?" queries.
 *
 * before / after: snapshots of the grant state before and after adjustment.
 * evidence: human-readable list of reasons (trust events, policy rules) that drove the change.
 * triggeredBy: system (automated evaluator), approver (manual), incident_guard (emergency hardening)
 */

import mongoose, { Schema } from 'mongoose';

const DelegationAdjustmentLogSchema = new Schema(
  {
    tenantId:     { type: String, index: true, required: true },
    operatorId:   { type: String, index: true, required: true },
    commandClass: { type: String, index: true, required: true },

    action: {
      type:     String,
      required: true,
      // grant_created|grant_expanded|grant_reduced|grant_revoked|probation_entered|probation_cleared
    },

    before:       { type: Schema.Types.Mixed, default: {} },
    after:        { type: Schema.Types.Mixed, default: {} },
    triggeredBy:  { type: String, required: true }, // system|approver|evaluator|incident_guard
    reason:       { type: String, default: '' },
    evidence:     [{ type: String }],
  },
  { timestamps: true }
);

DelegationAdjustmentLogSchema.index({ tenantId: 1, operatorId: 1, createdAt: -1 });
DelegationAdjustmentLogSchema.index({ tenantId: 1, action: 1, createdAt: -1 });

export default mongoose.models.DelegationAdjustmentLog ||
  mongoose.model('DelegationAdjustmentLog', DelegationAdjustmentLogSchema);

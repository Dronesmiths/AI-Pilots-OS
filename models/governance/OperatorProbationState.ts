/**
 * models/governance/OperatorProbationState.ts
 *
 * Tracks active probation state for operators.
 * Probation restricts delegation to submit_only (at most) and forces dual approval
 * on high-risk commands regardless of existing grants.
 *
 * Unique per (tenantId, operatorId) — one active record per operator.
 * When probation is cleared, active=false and clearedBy is set.
 * A new probation creates a new record (audit trail preserved).
 *
 * restrictions.maxDelegationLevel: hard ceiling while on probation.
 * Probation ends automatically at endsAt OR manually via clear route.
 */

import mongoose, { Schema } from 'mongoose';

const OperatorProbationStateSchema = new Schema(
  {
    tenantId:   { type: String, index: true, required: true },
    operatorId: { type: String, index: true, required: true },

    active:     { type: Boolean, default: false, index: true },
    startedAt:  { type: Date },
    endsAt:     { type: Date, index: true },

    reasons:    [{ type: String }],

    restrictions: {
      blockEmergencyCommands:        { type: Boolean, default: true },
      forceDualApprovalForHighRisk:  { type: Boolean, default: true },
      maxDelegationLevel:            { type: String,  default: 'submit_only' },
    },

    enteredBy:  { type: String, default: 'system' },
    clearedBy:  { type: String, default: '' },
  },
  { timestamps: true }
);

OperatorProbationStateSchema.index({ tenantId: 1, operatorId: 1, active: 1 });
OperatorProbationStateSchema.index({ endsAt: 1, active: 1 }); // for auto-expiry cron

export default mongoose.models.OperatorProbationState ||
  mongoose.model('OperatorProbationState', OperatorProbationStateSchema);

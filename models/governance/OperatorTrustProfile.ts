/**
 * models/governance/OperatorTrustProfile.ts
 *
 * Persistent multi-dimensional trust scorecard per operator.
 * overallTrust.score: 0-100 (weighted composite of all dimensions)
 * overallTrust.band:  restricted|baseline|trusted|elevated|elite
 * overallTrust.confidence: 0-1 (grows with sample size, dampens new trust)
 *
 * Trust is slow to earn (positive sample weight ~1.2×),
 * fast to lose for dangerous outcomes (rollback = -4.0, incident = -6.0).
 *
 * effectiveTrust = score * confidence + 50 * (1 - confidence)
 * (baseline of 50 until sufficient evidence exists)
 */

import mongoose, { Schema } from 'mongoose';

const OperatorTrustProfileSchema = new Schema(
  {
    tenantId:   { type: String, index: true, required: true },
    operatorId: { type: String, index: true, required: true },

    identity: {
      name:  { type: String, default: '' },
      email: { type: String, default: '' },
      role:  { type: String, index: true, required: true },
    },

    overallTrust: {
      score:               { type: Number, default: 50 },          // 0-100
      band:                { type: String, default: 'baseline' },  // restricted|baseline|trusted|elevated|elite
      confidence:          { type: Number, default: 0 },           // 0-1
      lastRecalculatedAt:  { type: Date },
    },

    dimensions: {
      approvalReliability:   { type: Number, default: 50 }, // followed approval process correctly
      executionReliability:  { type: Number, default: 50 }, // successful execution rate
      rollbackPenalty:       { type: Number, default: 0  }, // accumulated rollback damage
      emergencyDiscipline:   { type: Number, default: 50 }, // proper emergency usage
      policySafety:          { type: Number, default: 50 }, // avoided policy violations
      incidentBehavior:      { type: Number, default: 50 }, // behavior during incidents
    },

    status: {
      active:                        { type: Boolean, default: true },
      delegatedAuthoritySuspended:   { type: Boolean, default: false },
      suspendedReason:               { type: String,  default: '' },
      probationUntil:                { type: Date },
    },

    counters: {
      commandsSubmitted:       { type: Number, default: 0 },
      commandsApproved:        { type: Number, default: 0 },
      commandsExecuted:        { type: Number, default: 0 },
      commandsRejected:        { type: Number, default: 0 },
      commandsRolledBack:      { type: Number, default: 0 },
      highRiskCommands:        { type: Number, default: 0 },
      dualApprovalTriggers:    { type: Number, default: 0 },
    },

    metadata: {
      notes:        { type: String, default: '' },
      modelVersion: { type: String, default: 'v1' },
    },
  },
  { timestamps: true }
);

OperatorTrustProfileSchema.index({ tenantId: 1, operatorId: 1 }, { unique: true });
OperatorTrustProfileSchema.index({ tenantId: 1, 'overallTrust.band': 1, 'status.active': 1 });

export default mongoose.models.OperatorTrustProfile ||
  mongoose.model('OperatorTrustProfile', OperatorTrustProfileSchema);

/**
 * models/governance/OperatorDelegationGrant.ts
 *
 * The living authority grant for an operator in a specific command class.
 * This is NOT role policy — role policy defines what a role may ever be eligible for.
 * DelegationGrant defines what this exact operator may currently do without approval.
 *
 * grant.level (ordered, escalating power):
 *   none → shadow_only → submit_only → execute_low → execute_medium → execute_high
 *
 * lifecycle.expiresAt: grants expire — continued trust must be demonstrated.
 * constraints.requiresSecondReviewAbove: risk threshold above which approval still needed
 *   even when grant level would normally allow direct execution.
 */

import mongoose, { Schema } from 'mongoose';

const OperatorDelegationGrantSchema = new Schema(
  {
    tenantId:     { type: String, index: true, required: true },
    operatorId:   { type: String, index: true, required: true },
    commandClass: { type: String, index: true, required: true },

    scope: {
      type:           { type: String, default: 'tenant' }, // tenant|site|family|cluster|policy_domain
      siteIds:        [{ type: String }],
      familyIds:      [{ type: String }],
      clusterIds:     [{ type: String }],
      policyDomains:  [{ type: String }],
    },

    grant: {
      level:          { type: String, required: true },   // none|shadow_only|submit_only|execute_low|execute_medium|execute_high
      grantedBy:      { type: String, required: true },   // system|approver_id|policy
      grantedReason:  { type: String, default: '' },
      active:         { type: Boolean, default: true },
    },

    constraints: {
      maxRiskScore:              { type: Number,  default: 25 },
      protectedWindowsBlocked:   { type: Boolean, default: true },
      incidentModeBlocked:       { type: Boolean, default: true },
      emergencyOnly:             { type: Boolean, default: false },
      requiresSecondReviewAbove: { type: Number,  default: 0 },
    },

    lifecycle: {
      startsAt:           { type: Date, default: Date.now },
      expiresAt:          { type: Date },
      revokedAt:          { type: Date },
      revokedReason:      { type: String, default: '' },
      lastRevalidatedAt:  { type: Date },
    },

    evidence: {
      trustScoreAtGrant:      { type: Number, default: 0 },
      trustConfidenceAtGrant: { type: Number, default: 0 },
      supportingSignals:      [{ type: String }],
    },
  },
  { timestamps: true }
);

OperatorDelegationGrantSchema.index({ tenantId: 1, operatorId: 1, commandClass: 1, 'grant.active': 1 });
OperatorDelegationGrantSchema.index({ 'lifecycle.expiresAt': 1, 'grant.active': 1 }); // for expiry cron

export default mongoose.models.OperatorDelegationGrant ||
  mongoose.model('OperatorDelegationGrant', OperatorDelegationGrantSchema);

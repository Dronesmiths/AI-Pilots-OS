/**
 * models/governance/OperatorCommandClassTrust.ts
 *
 * Command-class-scoped trust: an operator can be elite in content_publish
 * but restricted in global_policy. Class trust is independent of overall trust.
 *
 * trust.streak: consecutive successes (positive) or failures (negative)
 * trust.volatility: std deviation proxy (how unstable is trust in this class?)
 *
 * restrictions are hard overrides applied after high-shock events (rollbacks, incidents)
 * and cleared only after clean evidence accumulates.
 */

import mongoose, { Schema } from 'mongoose';

const OperatorCommandClassTrustSchema = new Schema(
  {
    tenantId:     { type: String, index: true, required: true },
    operatorId:   { type: String, index: true, required: true },
    commandClass: { type: String, index: true, required: true },

    trust: {
      score:      { type: Number, default: 50 }, // 0-100
      band:       { type: String, default: 'baseline' },
      confidence: { type: Number, default: 0 },  // 0-1
      streak:     { type: Number, default: 0 },  // + = success streak, - = failure streak
      volatility: { type: Number, default: 0 },  // spread proxy
    },

    outcomes: {
      successfulExecutions:     { type: Number, default: 0 },
      failedExecutions:         { type: Number, default: 0 },
      rollbacks:                { type: Number, default: 0 },
      deniedRequests:           { type: Number, default: 0 },
      approvalBypassesGranted:  { type: Number, default: 0 },
      approvalBypassesRevoked:  { type: Number, default: 0 },
    },

    restrictions: {
      forceApprovalRequired:      { type: Boolean, default: false },
      forceDualApprovalRequired:  { type: Boolean, default: false },
      noDelegation:               { type: Boolean, default: false },
    },

    lastSignalAt: { type: Date },
  },
  { timestamps: true }
);

OperatorCommandClassTrustSchema.index(
  { tenantId: 1, operatorId: 1, commandClass: 1 },
  { unique: true }
);
OperatorCommandClassTrustSchema.index({ tenantId: 1, commandClass: 1, 'trust.band': 1 });

export default mongoose.models.OperatorCommandClassTrust ||
  mongoose.model('OperatorCommandClassTrust', OperatorCommandClassTrustSchema);

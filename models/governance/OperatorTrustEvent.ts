/**
 * models/governance/OperatorTrustEvent.ts
 *
 * Immutable trust signal record. Every significant operator command outcome
 * emits a trust event that feeds recalculateCommandClassTrust.ts.
 *
 * signal.weight:   1-10 (how much does this shift trust?)
 * signal.positive: is this a positive or negative signal?
 * signal.severity: for negative events: how severe? (1=minor, 10=catastrophic)
 *
 * eventTypes:
 *   approved                 → operator followed process correctly
 *   denied                   → policy blocked, signals poor judgment
 *   executed_success         → execution completed without issue
 *   executed_failure         → execution failed (bad assumption, system error)
 *   rollback                 → delegated command required rollback (strong negative)
 *   incident_penalty         → command linked to site incident (severe negative)
 *   emergency_success        → correct emergency usage (positive)
 *   emergency_failure        → emergency misuse or failure (strong negative)
 *   overreach_attempt        → tried to exceed allowed scope (negative)
 *   probation_entered        → system placed operator on probation
 *   probation_cleared        → probation lifted after clean streak
 */

import mongoose, { Schema } from 'mongoose';

const OperatorTrustEventSchema = new Schema(
  {
    tenantId:     { type: String, index: true, required: true },
    operatorId:   { type: String, index: true, required: true },
    commandId:    { type: String, index: true },
    commandClass: { type: String, index: true, required: true },
    commandType:  { type: String, required: true },

    eventType: {
      type:     String,
      index:    true,
      required: true,
      // approved|denied|executed_success|executed_failure|rollback|incident_penalty
      // emergency_success|emergency_failure|overreach_attempt|probation_entered|probation_cleared
    },

    signal: {
      weight:      { type: Number, default: 0 },
      positive:    { type: Boolean, default: false },
      severity:    { type: Number, default: 0 },    // 1-10 for negative events
      explanation: { type: String, default: '' },
    },

    context: {
      riskScore:    { type: Number, default: 0 },
      riskBand:     { type: String, default: 'low' },
      incidentMode: { type: Boolean, default: false },
      shadowMode:   { type: Boolean, default: false },
    },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

OperatorTrustEventSchema.index({ tenantId: 1, operatorId: 1, createdAt: -1 });
OperatorTrustEventSchema.index({ tenantId: 1, operatorId: 1, commandClass: 1, createdAt: -1 });

export default mongoose.models.OperatorTrustEvent ||
  mongoose.model('OperatorTrustEvent', OperatorTrustEventSchema);

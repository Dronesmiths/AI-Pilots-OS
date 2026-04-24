/**
 * models/governance/CommandRoutingDecision.ts
 *
 * Immutable routing record for every governed operator command.
 * Written when a command is submitted and routing is computed.
 *
 * route values (ordered by operator autonomy, ascending):
 *   rejected           → policy violation, not executable
 *   incident_queue     → system under stress, queued for review
 *   dual_approval      → high risk, separation of duty required
 *   approval_required  → single approver required
 *   shadow             → run simulation only, no live mutation
 *   delayed            → valid but batch-scheduled for later
 *   guarded_execute    → approved, but with rollback hooks + pre-checks
 *   auto_execute       → trusted + low risk, immediate execution
 *
 * executionPlan.guardrails: list of active guardrail IDs applied
 * executionPlan.fallbackRoute: if primary route fails, fallback to this
 */

import mongoose, { Schema } from 'mongoose';

const CommandRoutingDecisionSchema = new Schema(
  {
    tenantId:   { type: String, index: true, required: true },
    commandId:  { type: String, index: true, required: true, unique: true },

    routing: {
      route: {
        type: String,
        required: true,
        index: true,
        // rejected|incident_queue|dual_approval_required|approval_required
        // shadow|delayed|guarded_execute|auto_execute
      },
      reason:          { type: String, default: '' },
      confidence:      { type: Number, default: 0 },
      routingVersion:  { type: String, default: 'v1' },
    },

    inputs: {
      riskScore:       { type: Number },
      riskBand:        { type: String },
      trustScore:      { type: Number },
      trustBand:       { type: String },
      trustConfidence: { type: Number },
      delegationLevel: { type: String },
      incidentMode:    { type: Boolean },
      forceApproval:   { type: Boolean },
      forceDualApproval: { type: Boolean },
    },

    controls: {
      requiresApproval:      { type: Boolean },
      requiresDualApproval:  { type: Boolean },
      requiresShadow:        { type: Boolean },
      delayMs:               { type: Number },
    },

    executionPlan: {
      executor:       { type: String },
      guardrails:     [{ type: String }],
      fallbackRoute:  { type: String },
    },
  },
  { timestamps: true }
);

CommandRoutingDecisionSchema.index({ tenantId: 1, 'routing.route': 1, createdAt: -1 });

export default mongoose.models.CommandRoutingDecision ||
  mongoose.model('CommandRoutingDecision', CommandRoutingDecisionSchema);

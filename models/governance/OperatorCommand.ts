/**
 * models/governance/OperatorCommand.ts
 *
 * Production operator command model with full tenancy, identity, evaluation,
 * execution tracking, and rollback linkage.
 *
 * Lifecycle: submitted → evaluated → [rejected|shadow_only|approval_required|approved]
 *             → executing → [executed|failed|rolled_back]
 */

import mongoose, { Schema } from 'mongoose';

const OperatorCommandSchema = new Schema(
  {
    tenantId: { type: String, index: true, required: true },
    siteId:   { type: String, index: true },

    commandType:  { type: String, index: true, required: true },
    commandClass: { type: String, index: true, required: true },
    targetType:   { type: String, required: true },
    targetId:     { type: String, index: true, required: true },

    payload:        { type: Schema.Types.Mixed, default: {} },
    justification:  { type: String, default: '' },

    operator: {
      operatorId: { type: String, index: true, required: true },
      name:       { type: String, default: '' },
      role:       { type: String, index: true, required: true },
      sessionId:  { type: String, default: '' },
      sourceIp:   { type: String, default: '' },
    },

    // ── Authority metadata — root operators are observed not blocked ──────
    authority: {
      level:             { type: String, default: 'operator' }, // operator | root
      isFounder:         { type: Boolean, default: false },
      overrideRequested: { type: Boolean, default: false },
      overrideReason:    { type: String, default: '' },
      emergencyAccess:   { type: Boolean, default: false },
    },

    // ── Constitutional evaluation (runs BEFORE policy/risk/approval) ──────
    constitutional: {
      status: {
        type:    String,
        default: 'unevaluated',
        // unevaluated | lawful | conditionally_lawful | unlawful | override_allowed
      },
      legalClass:         { type: String, default: '' },
      blastRadius:        { type: String, default: 'low' }, // low | medium | high | critical
      matchedClauseKeys:  [{ type: String }],
      blockingClauseKeys: [{ type: String }],
      requiredProcedures: [{ type: String }],
      exceptionGrantId:   { type: String, default: '' },
      violationId:        { type: String, default: '' },
      summary:            { type: String, default: '' },
      evaluatedAt:        { type: Date },
      constitutionalAuditLogId: { type: String, default: '' },
    },

    evaluation: {
      legal:            { type: Boolean, default: false },
      policyDecision:   { type: String, default: 'pending' }, // reject|shadow_only|approval_required|dual_approval_required|allow
      riskScore:        { type: Number, default: 0 },
      riskBand:         { type: String, default: 'low' },      // low|medium|high|critical
      reasons:          [{ type: String }],
      evaluatorVersion: { type: String, default: 'v2' },
      delegatedAuthority: { type: Schema.Types.Mixed, default: null },
    },

    status: {
      type:  String,
      index: true,
      default: 'submitted',
      // submitted|rejected|shadow_only|approval_required|dual_approval_required
      // approved|executing|executed|failed|rolled_back|expired
      // constitutional_blocked|exception_requested|override_applied
    },

    approval: {
      required:             { type: Boolean, default: false },
      dualControlRequired:  { type: Boolean, default: false },
      approverIds:          [{ type: String }],
      approvedAt:           { type: Date },
      deniedAt:             { type: Date },
      denialReason:         { type: String, default: '' },
    },

    execution: {
      startedAt:          { type: Date },
      completedAt:        { type: Date },
      executor:           { type: String, default: '' },
      outcome:            { type: String, default: '' },   // success|failed|noop
      error:              { type: String, default: '' },
      rollbackCommandId:  { type: String, default: '' },
      // Constitutional state at moment of execution (may differ from evaluation)
      constitutional: {
        lawfulAtExecution:  { type: Boolean, default: false },
        matchedClauseKeys:  [{ type: String }],
        exceptionGrantId:   { type: String, default: '' },
        blockedAtExecution: { type: Boolean, default: false },
      },
    },

    metadata: {
      incidentMode:    { type: Boolean, default: false },
      emergency:       { type: Boolean, default: false },
      idempotencyKey:  { type: String, index: true, default: '' },
      tags:            [{ type: String }],
    },
  },
  { timestamps: true }
);

OperatorCommandSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
OperatorCommandSchema.index({ tenantId: 1, 'operator.operatorId': 1, createdAt: -1 });
OperatorCommandSchema.index({ tenantId: 1, commandClass: 1, status: 1 });
OperatorCommandSchema.index({ 'constitutional.status': 1, createdAt: -1 });
OperatorCommandSchema.index({ 'authority.level': 1, 'authority.overrideRequested': 1 });

export default mongoose.models.OperatorCommand ||
  mongoose.model('OperatorCommand', OperatorCommandSchema);

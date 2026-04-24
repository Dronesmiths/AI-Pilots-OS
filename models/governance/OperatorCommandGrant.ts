/**
 * models/governance/OperatorCommandGrant.ts
 *
 * Scoped permission surface for a specific operator and command class.
 * Grants are the delegation mechanism — not roles.
 *
 * grantKey: {operatorId}::{commandClass}[::{scopeSelector.tenantId}]
 *
 * scopeSelector.tenantId / scopePrefix use '*' for wildcard (any scope).
 * constraints.expirationAt = null means never expires.
 *
 * One operator can have multiple grants for the same commandClass
 * with different scope selectors (e.g., different tenant access).
 */
import mongoose, { Schema, Model } from 'mongoose';

const GrantConstraintsSchema = new Schema(
  {
    maxRiskBand:      { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    approvalRequired: { type: Boolean, default: false },
    expirationAt:     { type: Date, default: null },
  },
  { _id: false }
);

const OperatorCommandGrantSchema = new Schema(
  {
    grantKey:   { type: String, required: true, unique: true, index: true },
    operatorId: { type: String, required: true, index: true },

    commandClass: {
      type: String, required: true, index: true,
      enum: [
        'planner_override', 'policy_override', 'champion_override',
        'rollback_rule', 'reopen_scope', 'promote_challenger',
        'pause_automation', 'resume_automation',
        'global_policy_change', 'emergency_shutdown',
      ],
    },

    allowed: { type: Boolean, default: true, index: true },

    scopeSelector: {
      tenantId:    { type: String, default: '*' },
      scopePrefix: { type: String, default: '*' },
    },

    constraints: { type: GrantConstraintsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

OperatorCommandGrantSchema.index({ operatorId: 1, commandClass: 1 });

const OperatorCommandGrant: Model<any> =
  mongoose.models.OperatorCommandGrant ||
  mongoose.model('OperatorCommandGrant', OperatorCommandGrantSchema);

export default OperatorCommandGrant;

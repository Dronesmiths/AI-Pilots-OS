/**
 * models/governance/RolePolicy.ts
 *
 * Per-tenant, per-role permission matrix with risk thresholds and scope controls.
 * Unlike NovaOperatorRolePolicy (singleton), this is per-tenant + per-role
 * allowing different permission sets across client environments.
 *
 * rules[].allowedScopes: restrict command class to specific site/family/cluster IDs
 * hardDenies: command classes that are always blocked regardless of anything else
 */

import mongoose, { Schema } from 'mongoose';

const RoleRuleSchema = new Schema(
  {
    commandClass:               { type: String, required: true },
    allow:                      { type: Boolean, default: true },
    maxDirectRiskScore:         { type: Number,  default: 25 },
    requireApprovalAbove:       { type: Number,  default: 26 },
    requireDualApprovalAbove:   { type: Number,  default: 70 },
    allowEmergencyBypass:       { type: Boolean, default: false },
    allowedScopes:              [{ type: String }],
    protectedWindowsBlocked:    { type: Boolean, default: true },
  },
  { _id: false }
);

const RolePolicySchema = new Schema(
  {
    tenantId: { type: String, index: true, required: true },
    role:     { type: String, index: true, required: true },

    rules:      { type: [RoleRuleSchema], default: [] },
    hardDenies: [{ type: String }],
    notes:      { type: String, default: '' },
    version:    { type: Number, default: 1 },
    active:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

RolePolicySchema.index({ tenantId: 1, role: 1, active: 1 });
RolePolicySchema.index({ tenantId: 1, role: 1 }, { unique: true });

export default mongoose.models.RolePolicy ||
  mongoose.model('RolePolicy', RolePolicySchema);

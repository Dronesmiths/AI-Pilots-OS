/**
 * models/governance/OperatorProfile.ts
 *
 * Defines the human actor and their base authority.
 *
 * trustTier hierarchy:
 *   observer < analyst < supervisor < admin < owner < constitutional
 *
 * 'constitutional' trust tier is required for emergency commands and
 * global policy changes. Assign sparingly — typically only system owners.
 *
 * scopeAccess.allowGlobal = true bypasses tenantId/scopePrefix filters.
 * emergencyPrivileges are separate from role — must be explicitly granted.
 */
import mongoose, { Schema, Model } from 'mongoose';

const ScopeAccessSchema = new Schema(
  {
    tenantIds:     { type: [String], default: [] },
    scopePrefixes: { type: [String], default: [] },
    allowGlobal:   { type: Boolean, default: false },
  },
  { _id: false }
);

const EmergencyPrivilegesSchema = new Schema(
  {
    canPauseSystem:       { type: Boolean, default: false },
    canFreezeAutomation:  { type: Boolean, default: false },
    canForceRollback:     { type: Boolean, default: false },
  },
  { _id: false }
);

const OperatorProfileSchema = new Schema(
  {
    operatorId:   { type: String, required: true, unique: true, index: true },
    displayName:  { type: String, required: true },
    email:        { type: String, default: '' },

    role: {
      type: String, required: true, index: true,
      enum: ['owner', 'admin', 'supervisor', 'analyst', 'observer', 'api_client'],
    },

    trustTier: {
      type: String, default: 'low', index: true,
      enum: ['low', 'medium', 'high', 'constitutional'],
    },

    active:         { type: Boolean, default: true, index: true },
    scopeAccess:    { type: ScopeAccessSchema,       default: () => ({}) },
    emergencyPrivileges: { type: EmergencyPrivilegesSchema, default: () => ({}) },

    // Adaptive trust tracking
    commandCount:      { type: Number, default: 0 },
    blockedCount:      { type: Number, default: 0 },
    successfulCount:   { type: Number, default: 0 },
    trustScore:        { type: Number, default: 50 },   // 0..100
  },
  { timestamps: true }
);

const OperatorProfile: Model<any> =
  mongoose.models.OperatorProfile ||
  mongoose.model('OperatorProfile', OperatorProfileSchema);

export default OperatorProfile;

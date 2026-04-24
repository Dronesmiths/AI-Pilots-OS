/**
 * models/ConversionOpportunity.ts
 *
 * Stores system-generated growth opportunities for a tenant.
 * Shown in the ConversionPanel — each opportunity has:
 *   - executionMode: auto | hybrid | suggested
 *   - All 'auto' and 'hybrid' base actions execute WITHOUT user input
 *   - User actions are optional amplifiers, never blockers
 *
 * Critical design rule:
 *   ❌ The autopilot loop NEVER waits for user input
 *   ✅ User clicks accelerate, not enable
 */

import mongoose, { Schema, Model } from 'mongoose';

const ConversionOpportunitySchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: ['scale_winner', 'fix_decline', 'expand_cluster', 'increase_budget', 'upgrade_plan'],
      required: true,
    },

    title:       { type: String, required: true },
    description: { type: String, default: '' },

    /**
     * auto      → system executes automatically regardless of user
     * hybrid    → system does baseline; user can amplify
     * suggested → shown to user only; no automatic execution
     */
    executionMode: {
      type: String,
      enum: ['auto', 'hybrid', 'suggested'],
      required: true,
      default: 'hybrid',
    },

    /** Payload the system executes automatically (auto + hybrid modes) */
    autoPayload: { type: Schema.Types.Mixed, default: null },

    /** CTA shown to user for optional amplification */
    action: {
      label:    { type: String },
      endpoint: { type: String },
      payload:  { type: Schema.Types.Mixed },
    },

    estimatedImpact: {
      trafficLift: { type: Number, default: 0 },   // % estimate
      revenueLift: { type: Number, default: 0 },   // % estimate
    },

    urgency: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },

    /** Set true when auto-executed by the system in this cycle */
    autoExecuted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ConversionOpportunitySchema.index({ tenantId: 1, createdAt: -1 });

const ConversionOpportunity: Model<any> =
  mongoose.models.ConversionOpportunity ||
  mongoose.model('ConversionOpportunity', ConversionOpportunitySchema);

export default ConversionOpportunity;

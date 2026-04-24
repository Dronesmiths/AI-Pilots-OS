/**
 * models/TenantRuntimeState.ts
 *
 * Per-tenant runtime maturity state.
 * Each tenant matures independently from cold → warming → warm,
 * regardless of global system state.
 *
 * Effective behavior = min(globalState, tenantState)
 * → resolveEffectiveRuntimeState() enforces the ceiling rule.
 */
import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const TenantRuntimeStateSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },

    state: {
      type:    String,
      enum:    ['cold', 'warming', 'warm', 'degraded'],
      default: 'cold',
      index:   true,
    },

    activatedAt: { type: Date },
    warmedAt:    { type: Date },
    degradedAt:  { type: Date },

    metrics: {
      jobsProcessedSinceActivation: { type: Number, default: 0 },
      failedJobsSinceActivation:    { type: Number, default: 0 },
      queueDepth:                   { type: Number, default: 0 },
      lastSuccessfulActionAt:       { type: Date },
      pagesPublished:               { type: Number, default: 0 },
      internalLinksAdded:           { type: Number, default: 0 },
    },

    // Rolling transition log (capped at 20)
    notes: [{ type: String }],
  },
  { timestamps: true }
);

export type TenantRuntimeStateDocument = InferSchemaType<typeof TenantRuntimeStateSchema>;

const TenantRuntimeState: Model<TenantRuntimeStateDocument> =
  mongoose.models.TenantRuntimeState ||
  mongoose.model('TenantRuntimeState', TenantRuntimeStateSchema);

export default TenantRuntimeState;

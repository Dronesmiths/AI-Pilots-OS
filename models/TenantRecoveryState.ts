/**
 * models/TenantRecoveryState.ts
 *
 * Per-tenant recovery rate-limit state.
 * Tracks how many recoveries have run in the last hour
 * and when the global cooldown expires.
 *
 * Also drives the "Recovering" badge in TenantOverviewGrid —
 * if cooldownUntil > now, the tenant is actively in a recovery window.
 *
 * One document per tenant. Upserted by runRecovery() after each run.
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const TenantRecoveryStateSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },

    lastRecoveryAt:        { type: Date },
    recoveryCountLastHour: { type: Number, default: 0 },
    cooldownUntil:         { type: Date },

    lastHealthStatus: {
      type:    String,
      enum:    ['healthy', 'warning', 'critical'],
      default: 'healthy',
    },

    lastExecutedActions: [String], // most recent run's auto-executed actions
  },
  { timestamps: true }
);

export type TenantRecoveryStateDocument = InferSchemaType<typeof TenantRecoveryStateSchema>;

export default mongoose.models.TenantRecoveryState ||
  mongoose.model('TenantRecoveryState', TenantRecoveryStateSchema);

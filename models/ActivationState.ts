/**
 * models/ActivationState.ts
 *
 * Tracks the first-run activation lifecycle per client.
 * Created by runInstallFlow, updated by runFirstActivation.
 *
 * status: pending → running → complete | failed
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ActivationStateSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  status: {
    type:    String,
    default: 'pending',
    // pending | running | complete | failed
  },

  steps: {
    gscSync:                { type: Boolean, default: false },
    metricsSeeded:          { type: Boolean, default: false },
    growthFeedCreated:      { type: Boolean, default: false },
    opportunitiesGenerated: { type: Boolean, default: false },
    autopilotActivated:     { type: Boolean, default: false },
  },

  // Seeded metrics snapshot
  metrics: {
    impressions:      { type: Number, default: 0 },
    clicks:           { type: Number, default: 0 },
    avgPosition:      { type: Number, default: 0 },
    pagesTracked:     { type: Number, default: 0 },
    keywordsTracked:  { type: Number, default: 0 },
    isEstimated:      { type: Boolean, default: false }, // true = fallback data used
    // "Trend illusion" — previous snapshot for % change display
    previous: {
      impressions: { type: Number, default: 0 },
      clicks:      { type: Number, default: 0 },
    },
  },

  // Initial opportunities generated
  opportunities: [{
    type:    { type: String },
    message: { type: String },
    priority: { type: String, default: 'medium' },
  }],

  // Autopilot config
  autopilot: {
    enabled:  { type: Boolean, default: false },
    mode:     { type: String, default: 'balanced' },
    lastRun:  { type: Date },
    nextRun:  { type: Date },
  },

  startedAt:   { type: Date },
  completedAt: { type: Date },
  errors:      [{ type: String }],
}, { timestamps: true });

ActivationStateSchema.index({ tenantId: 1, clientId: 1 }, { unique: true });

export type ActivationStateDocument = InferSchemaType<typeof ActivationStateSchema>;
export default mongoose.models.ActivationState ||
  mongoose.model('ActivationState', ActivationStateSchema);

/**
 * models/EngineState.ts
 *
 * SEO engine configuration per tenant.
 * Created during activation Step 3 (provisionEngine).
 * Read by drone fleet and bandit strategy selection.
 *
 * Separate from SeoBanditState (which tracks arm-level reward stats)
 * and SeoGoal (which tracks individual goal progress).
 * This is the single-record "engine config" — what mode is the OS in.
 */
import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const EngineStateSchema = new Schema(
  {
    tenantId: { type: String, required: true, unique: true, index: true },
    strategyMode: {
      type:    String,
      enum:    ['growth', 'balanced', 'safe'],
      default: 'growth',
    },
    banditEnabled: { type: Boolean, default: true },
    goals: {
      type:    [String],
      default: ['indexation', 'content_velocity', 'internal_links'],
    },
    status: {
      type:    String,
      enum:    ['provisioning', 'ready', 'error'],
      default: 'provisioning',
      index:   true,
    },
  },
  { timestamps: true }
);

export type EngineStateDocument = InferSchemaType<typeof EngineStateSchema>;

const EngineState: Model<EngineStateDocument> =
  mongoose.models.EngineState || mongoose.model('EngineState', EngineStateSchema);

export default EngineState;

/**
 * models/MomentumScore.ts
 *
 * Rolling momentum score — updates weekly.
 * Drives dashboard display, churn alerts, and upsell logic.
 *
 * score: 0-100
 * trend: "up" | "flat" | "down"
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const MomentumScoreSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  score: { type: Number, default: 50, min: 0, max: 100 },

  components: {
    growth:      { type: Number, default: 0 }, // impression/click growth (0-35)
    activity:    { type: Number, default: 0 }, // pages created + links added (0-25)
    rankings:    { type: Number, default: 0 }, // position improvements (0-25)
    consistency: { type: Number, default: 0 }, // weeks of positive data (0-15)
  },

  trend:     { type: String, default: 'flat' }, // up | flat | down
  trendNote: { type: String, default: '' },     // human label shown in UI

  history: [{
    score:     { type: Number },
    trend:     { type: String },
    recordedAt: { type: Date },
  }],

  lastUpdatedAt: { type: Date },
}, { timestamps: true });

MomentumScoreSchema.index({ tenantId: 1, clientId: 1 }, { unique: true });

export type MomentumScoreDocument = InferSchemaType<typeof MomentumScoreSchema>;
export default mongoose.models.MomentumScore ||
  mongoose.model('MomentumScore', MomentumScoreSchema);

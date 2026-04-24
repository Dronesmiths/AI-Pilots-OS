/**
 * models/RetentionSignal.ts
 *
 * Churn risk assessment per client — one record, updated weekly.
 * Drives auto-intervention when risk = "high".
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const RetentionSignalSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  riskLevel: {
    type:    String,
    default: 'low',
    // low | medium | high
  },

  reasons: [{ type: String }],

  // Intervention tracking
  intervention: {
    triggered:   { type: Boolean, default: false },
    triggeredAt: { type: Date },
    type:        { type: String, default: '' }, // growth_events | email | escalate
    resolved:    { type: Boolean, default: false },
  },

  // Metrics at time of assessment
  snapshot: {
    daysSinceGrowth:      { type: Number, default: 0 },
    daysSinceNewPage:     { type: Number, default: 0 },
    consecutiveFlatWeeks: { type: Number, default: 0 },
    momentumScore:        { type: Number, default: 0 },
    impressionTrend:      { type: String, default: 'unknown' },
  },

  lastAssessedAt: { type: Date },
}, { timestamps: true });

RetentionSignalSchema.index({ tenantId: 1, clientId: 1 }, { unique: true });
RetentionSignalSchema.index({ riskLevel: 1, updatedAt: -1 });

export type RetentionSignalDocument = InferSchemaType<typeof RetentionSignalSchema>;
export default mongoose.models.RetentionSignal ||
  mongoose.model('RetentionSignal', RetentionSignalSchema);

/**
 * models/governance/CrossAnomalyTransferLog.ts
 *
 * Records every arm transfer between bandits (cross-anomaly learning).
 * Both source and target bandit IDs are indexed for dashboard traceability.
 */
import mongoose, { Schema } from 'mongoose';

const CrossAnomalyTransferLogSchema = new Schema({
  sourceBanditId:  { type: String, index: true, required: true },
  targetBanditId:  { type: String, index: true, required: true },
  sourceContextKey:{ type: String },
  targetContextKey:{ type: String },

  similarityScore: { type: Number, required: true },

  transferredArms: [String], // responseType values transferred

  contextMatch: {
    trustBand:    { type: String, default: '' },
    severityBand: { type: String, default: '' },
  },
}, { timestamps: true });

CrossAnomalyTransferLogSchema.index({ targetBanditId: 1, createdAt: -1 });

export default mongoose.models.CrossAnomalyTransferLog ||
  mongoose.model('CrossAnomalyTransferLog', CrossAnomalyTransferLogSchema);

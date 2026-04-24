/**
 * models/governance/GlobalArmPrior.ts
 *
 * Platform-wide memory of top-performing safe response arms.
 * Priors are soft — they bias initialization and low-data exploration,
 * but local evidence can always overtake them.
 *
 * Scopes:
 *   'global'           → all contexts combined (scopeKey: 'global')
 *   'trust_band'       → per trust band       (scopeKey: 'trust:high')
 *   'severity_band'    → per severity band     (scopeKey: 'severity:medium')
 *   'combined_context' → trust+severity        (scopeKey: 'trust:neutral|severity:medium')
 */
import mongoose, { Schema } from 'mongoose';

const GlobalArmPriorSchema = new Schema({
  responseType: { type: String, index: true, required: true },

  scope:    { type: String, default: 'global', enum: ['global','trust_band','severity_band','combined_context'] },
  scopeKey: { type: String, index: true, required: true },

  performance: {
    totalPulls:    { type: Number, default: 0 },
    averageReward: { type: Number, default: 0 },
    harmfulRate:   { type: Number, default: 0 },
    stabilityScore:{ type: Number, default: 0 }, // low variance = high stability
  },

  confidence: {
    score:      { type: Number, default: 0 }, // 0–1
    sampleSize: { type: Number, default: 0 },
    breadth:    { type: Number, default: 0 }, // unique anomaly types / contextKeys supporting this
    recencyWeight: { type: Number, default: 1 }, // 1 = recent, 0 = stale
  },

  lifecycle: {
    status:        { type: String, default: 'active', enum: ['active','degraded','deprecated'] },
    lastUpdatedAt: { type: Date },
    degradedAt:    { type: Date },
    // Drift detection: falling reward + rising harm over last window
    driftSignals:  { type: Number, default: 0 }, // 0–3
  },
}, { timestamps: true });

GlobalArmPriorSchema.index({ responseType: 1, scope: 1, scopeKey: 1 }, { unique: true });
GlobalArmPriorSchema.index({ 'lifecycle.status': 1, 'confidence.score': -1 });

export default mongoose.models.GlobalArmPrior ||
  mongoose.model('GlobalArmPrior', GlobalArmPriorSchema);

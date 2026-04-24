/**
 * models/SeoInterventionPolicy.ts
 *
 * Learned intervention thresholds for SEO-domain recovery decisions.
 * One record per (tenantId, domain) pair — upserted by updateSeoInterventionPolicy.
 *
 * Distinct from Nova governance models (ResponsePolicy, AnomalyActionPolicy)
 * which operate on TenantRuntimeState lifecycle anomalies.
 * This policy governs when/how aggressively to act on SEO content signals.
 *
 * Thresholds:
 *   observeMaxRisk   → below this, watch but don't act
 *   actMinRisk       → above this, trigger auto-recovery
 *   escalateRisk     → above this, send email alert to operator
 *
 * Behavior profile:
 *   aggressiveness   → how quickly to escalate (0=patient, 1=trigger-happy)
 *   falsePositiveRate → suppresses action if intervention noise is high
 *
 * Performance is updated by updateSeoInterventionPolicy() after each cycle
 * once sampleSize >= MIN_SAMPLE_SIZE (default: 10).
 */

import mongoose, { Schema, Model } from 'mongoose';

const SeoInterventionPolicySchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    domain: {
      type: String,
      required: true,
      enum: ['pattern_quality', 'exploration', 'drift', 'content_output'],
    },

    thresholds: {
      observeMaxRisk: { type: Number, default: 0.20 },   // below → observe
      actMinRisk:     { type: Number, default: 0.40 },   // above → auto-recover
      escalateRisk:   { type: Number, default: 0.75 },   // above → email alert
    },

    confidenceBands: {
      minConfidenceToAct:      { type: Number, default: 0.55 },
      minConfidenceToEscalate: { type: Number, default: 0.70 },
    },

    behaviorProfile: {
      aggressiveness:   { type: Number, default: 0.5 },  // 0–1
      patience:         { type: Number, default: 0.5 },
      falsePositiveRate:{ type: Number, default: 0    },
    },

    performance: {
      successRate:     { type: Number, default: 0 },
      avgOutcomeScore: { type: Number, default: 0 },
      sampleSize:      { type: Number, default: 0 },
    },

    lastUpdated: { type: Date, default: null },
  },
  { timestamps: true }
);

SeoInterventionPolicySchema.index({ tenantId: 1, domain: 1 }, { unique: true });

const SeoInterventionPolicy: Model<any> =
  mongoose.models.SeoInterventionPolicy ||
  mongoose.model('SeoInterventionPolicy', SeoInterventionPolicySchema);

export default SeoInterventionPolicy;

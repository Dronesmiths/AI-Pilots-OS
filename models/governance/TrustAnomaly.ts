/**
 * models/governance/TrustAnomaly.ts
 *
 * First-class anomaly record — created by detectTrustAnomalies, surfaced
 * on the trust dashboard and operator detail page.
 *
 * anomalyType:
 *   sudden_drop            — score fell ≥10 pts within 30 minutes
 *   repeated_negative_events — 3+ negative events in 60 minutes
 *   delegation_churn       — delegation changed 3+ times in 24 hours
 *   override_cluster       — 3+ override_used in 60 minutes
 *   violation_spike        — 2+ constitutional violations in 2 hours
 *   trust_oscillation      — band changed direction 3+ times in 24 hours
 *
 * status lifecycle: open → acknowledged | auto_handled → resolved | dismissed
 */
import mongoose, { Schema } from 'mongoose';

const TrustAnomalySchema = new Schema({
  tenantId:   { type: String, index: true, required: true },
  operatorId: { type: String, index: true, required: true },

  anomalyType: {
    type: String, index: true, required: true,
    enum: ['sudden_drop','repeated_negative_events','delegation_churn','override_cluster','violation_spike','trust_oscillation'],
  },

  severity: {
    type: String, default: 'medium',
    enum: ['low','medium','high','critical'],
  },

  summary:         { type: String, required: true },
  suggestedAction: { type: String, default: '' },

  evidence: {
    scoreDelta:     { type: Number, default: 0 },
    windowMinutes:  { type: Number, default: 0 },
    eventCount:     { type: Number, default: 0 },
    previousBand:   { type: String, default: '' },
    currentBand:    { type: String, default: '' },
    scoreAtDetect:  { type: Number, default: 0 },
    baselineScore:  { type: Number, default: 0 },
  },

  status: {
    type: String, default: 'open',
    enum: ['open','acknowledged','auto_handled','resolved','dismissed'],
    index: true,
  },

  autoResponseApplied: { type: String, default: '' },
  resolvedAt:          { type: Date },
  resolvedNote:        { type: String, default: '' },

}, { timestamps: true });

// Primary query index
TrustAnomalySchema.index({ tenantId: 1, status: 1, createdAt: -1 });
TrustAnomalySchema.index({ tenantId: 1, operatorId: 1, anomalyType: 1, status: 1, createdAt: -1 });

// Auto-purge resolved/dismissed anomalies after 30 days
TrustAnomalySchema.index(
  { resolvedAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: { $in: ['resolved','dismissed'] } } }
);

export default mongoose.models.TrustAnomaly ||
  mongoose.model('TrustAnomaly', TrustAnomalySchema);

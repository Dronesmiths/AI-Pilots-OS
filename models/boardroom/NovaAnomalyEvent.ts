/**
 * models/boardroom/NovaAnomalyEvent.ts
 *
 * A detected system anomaly — performance, governance, strategic, or operational.
 *
 * anomalyKey: deterministic "{anomalyType}::{scopeKey}::{YYYY-MM-DD}"
 *   One open anomaly per type per scope per day.
 *   upsertOpenAnomaly refreshes the existing record if already open —
 *   prevents alert spam when the cognition loop runs multiple times per day.
 *
 * status lifecycle: open → acknowledged → resolved | suppressed
 *
 * evidence: raw numeric data that triggered detection (for auditability)
 * recommendedAction: human-readable suggestion surfaced in the UI
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type AnomalyType =
  | 'roi_drop' | 'risk_spike' | 'concentration_risk' | 'decision_miss'
  | 'confidence_drift' | 'execution_stall' | 'governance_breach' | 'monitoring_gap';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AnomalyStatus   = 'open' | 'acknowledged' | 'resolved' | 'suppressed';
export type AnomalyScope    = 'global' | 'portfolio' | 'venture' | 'resolution';

export interface NovaAnomalyEventDocument extends Document {
  anomalyKey:       string;
  anomalyType:      AnomalyType;
  severity:         AnomalySeverity;
  scopeType:        AnomalyScope;
  scopeKey:         string;
  title:            string;
  summary:          string;
  evidence:         Record<string, unknown>;
  detectedAt:       Date;
  status:           AnomalyStatus;
  recommendedAction?: string;
  createdAt:        Date;
  updatedAt:        Date;
}

const NovaAnomalyEventSchema = new Schema<NovaAnomalyEventDocument>(
  {
    anomalyKey:  { type: String, required: true, unique: true, index: true },
    anomalyType: { type: String, enum: ['roi_drop','risk_spike','concentration_risk','decision_miss','confidence_drift','execution_stall','governance_breach','monitoring_gap'], required: true, index: true },
    severity:    { type: String, enum: ['low','medium','high','critical'], required: true, index: true },
    scopeType:   { type: String, enum: ['global','portfolio','venture','resolution'], required: true, index: true },
    scopeKey:    { type: String, required: true, index: true },
    title:       { type: String, required: true },
    summary:     { type: String, required: true },
    evidence:    { type: Schema.Types.Mixed, default: {} },
    detectedAt:  { type: Date, default: Date.now, index: true },
    status:      { type: String, enum: ['open','acknowledged','resolved','suppressed'], default: 'open', index: true },
    recommendedAction: String,
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

// Alert rail: open/acknowledged, sorted by severity then detectedAt
NovaAnomalyEventSchema.index({ status: 1, severity: -1, detectedAt: -1 });
// Anomaly lookup for prioritization: by type + scope (for recurrence counting)
NovaAnomalyEventSchema.index({ anomalyType: 1, scopeKey: 1 });

export const NovaAnomalyEvent: Model<NovaAnomalyEventDocument> =
  (mongoose.models.NovaAnomalyEvent as Model<NovaAnomalyEventDocument>) ||
  mongoose.model<NovaAnomalyEventDocument>('NovaAnomalyEvent', NovaAnomalyEventSchema);

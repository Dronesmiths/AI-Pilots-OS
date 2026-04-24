/**
 * models/boardroom/NovaAlertPolicy.ts
 *
 * Configurable thresholds for what counts as anomalous.
 * One global policy (scopeType='global', scopeKey='global') is the fallback.
 * Portfolio-specific policies override globally.
 *
 * minSeverityToAlert: alerts below this level are detected but not surfaced in UI.
 *   Prevents low-severity noise from cluttering the alert rail.
 *   Default: 'medium' — low alerts are tracked but suppressed from UI.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { AnomalySeverity } from './NovaAnomalyEvent';

export interface NovaAlertPolicyDocument extends Document {
  policyKey:                  string;
  scopeType:                  'global' | 'portfolio';
  scopeKey:                   string;
  // ── Override routing ───────────────
  tenantId?:                  string;
  portfolioKey?:              string;
  isDefault:                  boolean;
  isEnabled:                  boolean;
  // ── Alert thresholds ─────────────
  roiDropThreshold:           number;
  riskSpikeThreshold:         number;
  concentrationRiskThreshold: number;
  confidenceDriftThreshold:   number;
  executionStallHours:        number;
  minSeverityToAlert:         AnomalySeverity;
  createdAt:                  Date;
  updatedAt:                  Date;
}

const NovaAlertPolicySchema = new Schema<NovaAlertPolicyDocument>(
  {
    policyKey:    { type: String, required: true, unique: true, index: true },
    scopeType:    { type: String, enum: ['global','portfolio'], required: true, index: true },
    scopeKey:     { type: String, required: true, index: true },
    // Override routing
    tenantId:     { type: String, index: true },
    portfolioKey: { type: String, index: true },
    isDefault:    { type: Boolean, default: false, index: true },
    isEnabled:    { type: Boolean, default: true,  index: true },
    roiDropThreshold:           { type: Number, default: 0.20 },
    riskSpikeThreshold:         { type: Number, default: 0.15 },
    concentrationRiskThreshold: { type: Number, default: 0.70 },
    confidenceDriftThreshold:   { type: Number, default: 0.20 },
    executionStallHours:        { type: Number, default: 24  },
    minSeverityToAlert:         { type: String, enum: ['low','medium','high','critical'], default: 'medium' },
  },
  { timestamps: true }
);

NovaAlertPolicySchema.index({ scopeType: 1, scopeKey: 1 });
NovaAlertPolicySchema.index({ isDefault: 1, isEnabled: 1 });
NovaAlertPolicySchema.index({ tenantId: 1, isEnabled: 1 });
NovaAlertPolicySchema.index({ tenantId: 1, portfolioKey: 1, isEnabled: 1 });

export const NovaAlertPolicy: Model<NovaAlertPolicyDocument> =
  (mongoose.models.NovaAlertPolicy as Model<NovaAlertPolicyDocument>) ||
  mongoose.model<NovaAlertPolicyDocument>('NovaAlertPolicy', NovaAlertPolicySchema);

/**
 * models/boardroom/NovaAlertPriority.ts
 *
 * Priority score computed by runAlertPrioritization() for each open anomaly.
 * One priority record per anomaly (1:1 via unique anomalyKey).
 * Updated on each prioritization run — not historical, always current state.
 *
 * priorityScore: weighted composite (0–1 scale)
 *   severity × 0.30 + scopeImpact × 0.20 + recurrence × 0.10 + confidenceImpact × 0.20 + capitalExposure × 0.20
 *   All factors normalized to [0,1] before weighting.
 *
 * priorityKey and anomalyKey are both uniquely indexed.
 * The upsert filters on priorityKey (derived from anomalyKey) to avoid race conditions.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { AnomalySeverity } from './NovaAnomalyEvent';

export interface PriorityFactors {
  severity:         number;  // [0,1]
  scopeImpact:      number;  // [0,1]
  recurrence:       number;  // [0,1] — normalized (min 1, saturation at 10+)
  confidenceImpact: number;  // [0,1]
  capitalExposure:  number;  // [0,1] — fraction of total capital at risk
}

export interface NovaAlertPriorityDocument extends Document {
  priorityKey:   string;
  anomalyKey:    string;
  priorityScore: number;
  priorityLevel: AnomalySeverity;
  factors:       PriorityFactors;
  createdAt:     Date;
  updatedAt:     Date;
}

const NovaAlertPrioritySchema = new Schema<NovaAlertPriorityDocument>(
  {
    priorityKey:   { type: String, required: true, unique: true, index: true },
    anomalyKey:    { type: String, required: true, unique: true, index: true },
    priorityScore: { type: Number, default: 0 },
    priorityLevel: { type: String, enum: ['low','medium','high','critical'], required: true, index: true },
    factors: {
      severity:         Number,
      scopeImpact:      Number,
      recurrence:       Number,
      confidenceImpact: Number,
      capitalExposure:  Number,
    },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

export const NovaAlertPriority: Model<NovaAlertPriorityDocument> =
  (mongoose.models.NovaAlertPriority as Model<NovaAlertPriorityDocument>) ||
  mongoose.model<NovaAlertPriorityDocument>('NovaAlertPriority', NovaAlertPrioritySchema);

/**
 * models/boardroom/NovaIncident.ts
 *
 * A grouped incident composed of multiple related anomaly events.
 * Incidents reduce alert noise by clustering related signals into one actionable unit.
 *
 * Grouping logic (runIncidentGrouping):
 *   Primary grouping: anomalyType — all alerts of the same type in the same day = one incident
 *   Secondary: if multiple types hit the same scopeKey, they merge into a multi-type incident
 *
 * incidentKey: deterministic "{primaryType}::{YYYY-MM-DD}" — one per anomaly type per day
 *   Re-running grouping updates the anomalyKeys list and severity upgrade.
 *
 * severity represents the WORST severity among member anomalies.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type IncidentStatus = 'open' | 'monitoring' | 'resolved';

export interface NovaIncidentDocument extends Document {
  incidentKey:  string;
  anomalyKeys:  string[];
  primaryType:  string;
  scopeKeys:    string[];     // affected scopes
  severity:     'medium' | 'high' | 'critical';
  title:        string;
  status:       IncidentStatus;
  createdAt:    Date;
  updatedAt:    Date;
}

const NovaIncidentSchema = new Schema<NovaIncidentDocument>(
  {
    incidentKey: { type: String, required: true, unique: true, index: true },
    anomalyKeys: [String],
    primaryType: { type: String, index: true },
    scopeKeys:   [String],
    severity:    { type: String, enum: ['medium','high','critical'], required: true, index: true },
    title:       { type: String, required: true },
    status:      { type: String, enum: ['open','monitoring','resolved'], default: 'open', index: true },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

export const NovaIncident: Model<NovaIncidentDocument> =
  (mongoose.models.NovaIncident as Model<NovaIncidentDocument>) ||
  mongoose.model<NovaIncidentDocument>('NovaIncident', NovaIncidentSchema);

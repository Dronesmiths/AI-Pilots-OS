/**
 * models/boardroom/NovaExecutiveSummary.ts
 *
 * Board-level executive summary generated for a given scope (portfolio, venture, etc.)
 * for a given period (daily or weekly).
 *
 * summaryKey: deterministic "{scopeType}::{scopeKey}::{YYYY-MM-DD}"
 *   Same scope on same day upserts — recurring cognition loop is safe.
 *
 * Compound index (scopeType, scopeKey, createdAt) serves the generic
 * "latest N summaries for a scope" dashboard query.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type SummaryScope = 'portfolio' | 'venture' | 'organization' | 'global';

export interface NovaExecutiveSummaryDocument extends Document {
  summaryKey:          string;
  periodKey:           string;
  scopeType:           SummaryScope;
  scopeKey:            string;
  title:               string;
  summary:             string;
  topWins:             string[];
  topRisks:            string[];
  topRecommendations:  string[];
  confidence:          number;
  createdAt:           Date;
  updatedAt:           Date;
}

const NovaExecutiveSummarySchema = new Schema<NovaExecutiveSummaryDocument>(
  {
    summaryKey:         { type: String, required: true, unique: true, index: true },
    periodKey:          { type: String, required: true, index: true },
    scopeType:          { type: String, enum: ['portfolio','venture','organization','global'], required: true, index: true },
    scopeKey:           { type: String, required: true, index: true },
    title:              { type: String, required: true },
    summary:            { type: String, required: true },
    topWins:            [String],
    topRisks:           [String],
    topRecommendations: [String],
    confidence:         { type: Number, default: 0.5 },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

NovaExecutiveSummarySchema.index({ scopeType: 1, scopeKey: 1, createdAt: -1 });

export const NovaExecutiveSummary: Model<NovaExecutiveSummaryDocument> =
  (mongoose.models.NovaExecutiveSummary as Model<NovaExecutiveSummaryDocument>) ||
  mongoose.model<NovaExecutiveSummaryDocument>('NovaExecutiveSummary', NovaExecutiveSummarySchema);

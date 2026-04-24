/**
 * models/enterprise/NovaPortfolioRebalanceEvent.ts
 *
 * Audit log of every portfolio rebalance decision.
 * One event per venture per rebalance cycle, recording the action taken.
 *
 * Actions:
 *   increase  → venture is performing well, grow allocation
 *   decrease  → venture underperforming, reduce allocation
 *   hold      → neutral, maintain current weight
 *   exit      → kill the venture, reallocate its budget
 *   incubate  → new venture, small probe allocation
 *   merge     → combine two ventures (fromVentureKey → toVentureKey)
 *
 * eventKey format: "{portfolioKey}::{ventureKey}::{day}::{random}"
 *   day-scoped so one rebalance per day upserts cleanly.
 *   random suffix ensures concurrent rebalances don't collide.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type RebalanceAction = 'increase' | 'decrease' | 'hold' | 'exit' | 'incubate' | 'merge';

export interface NovaPortfolioRebalanceEventDocument extends Document {
  eventKey:        string;
  portfolioKey:    string;
  action:          RebalanceAction;
  ventureKey?:     string;
  fromVentureKey?: string;
  toVentureKey?:   string;
  rationale:       string;
  confidence:      number;
  impactScore:     number;
  metadata?:       Record<string, unknown>;
  createdAt:       Date;
  updatedAt:       Date;
}

const NovaPortfolioRebalanceEventSchema = new Schema<NovaPortfolioRebalanceEventDocument>(
  {
    eventKey:       { type: String, required: true, unique: true, index: true },
    portfolioKey:   { type: String, required: true, index: true },
    action:         { type: String, enum: ['increase','decrease','hold','exit','incubate','merge'], required: true, index: true },
    ventureKey:     String,
    fromVentureKey: String,
    toVentureKey:   String,
    rationale:      { type: String, required: true },
    confidence:     { type: Number, default: 0.5 },
    impactScore:    { type: Number, default: 0.5 },
    metadata:       { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Dashboard query: recent events for a portfolio
NovaPortfolioRebalanceEventSchema.index({ portfolioKey: 1, createdAt: -1 });

export const NovaPortfolioRebalanceEvent: Model<NovaPortfolioRebalanceEventDocument> =
  (mongoose.models.NovaPortfolioRebalanceEvent as Model<NovaPortfolioRebalanceEventDocument>) ||
  mongoose.model<NovaPortfolioRebalanceEventDocument>('NovaPortfolioRebalanceEvent', NovaPortfolioRebalanceEventSchema);

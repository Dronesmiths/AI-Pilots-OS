/**
 * models/enterprise/NovaPortfolio.ts
 *
 * The top-level portfolio entity — a named collection of ventures managed as one.
 * Think: AI Pilots Primary Portfolio, Church Growth Fund, Local Services Portfolio.
 *
 * Health metrics (updated on each rebalance cycle):
 *   portfolioROI:         weighted average ROI across active ventures
 *   diversificationScore: 0→1, higher = more evenly spread across domains
 *   concentrationRisk:    0→1, higher = more concentrated in one domain (bad)
 *
 * totalAllocatedCapital: the budget ceiling for this portfolio's autonomous spend.
 *   Nova will NOT autonomously deploy more than this without operator approval.
 *   This is the constitutional spending limit enforced by runPortfolioAllocator.
 *
 * status lifecycle:
 *   active → rebalancing → active  (rebalancing is transient, not persistent)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export interface NovaPortfolioDocument extends Document {
  portfolioKey:          string;
  name:                  string;
  description?:          string;
  ventureKeys:           string[];
  totalAllocatedCapital: number;   // constitutional spend ceiling
  totalEstimatedValue:   number;
  portfolioROI:          number;
  diversificationScore:  number;
  concentrationRisk:     number;
  status:                'active' | 'paused' | 'rebalancing';
  metadata?:             Record<string, unknown>;
  createdAt:             Date;
  updatedAt:             Date;
}

const NovaPortfolioSchema = new Schema<NovaPortfolioDocument>(
  {
    portfolioKey:          { type: String, required: true, unique: true, index: true },
    name:                  { type: String, required: true },
    description:           String,
    ventureKeys:           [String],
    totalAllocatedCapital: { type: Number, default: 100 },
    totalEstimatedValue:   { type: Number, default: 0 },
    portfolioROI:          { type: Number, default: 0, index: true },
    diversificationScore:  { type: Number, default: 0.5 },
    concentrationRisk:     { type: Number, default: 0.5 },
    status:                { type: String, enum: ['active','paused','rebalancing'], default: 'active', index: true },
    metadata:              { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const NovaPortfolio: Model<NovaPortfolioDocument> =
  (mongoose.models.NovaPortfolio as Model<NovaPortfolioDocument>) ||
  mongoose.model<NovaPortfolioDocument>('NovaPortfolio', NovaPortfolioSchema);

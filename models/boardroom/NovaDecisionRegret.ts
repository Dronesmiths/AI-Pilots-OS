/**
 * models/boardroom/NovaDecisionRegret.ts
 *
 * Final verdict on a decision after all monitoring windows complete (60 days).
 * Answers: was this the right move? Should it have been larger/smaller/blocked?
 *
 * regretScore: normalized (actual - expected) / max(0.001, |expected|)
 *   > 0:  better than predicted → positive surprise (no regret)
 *   ≈ 0:  matched prediction → well-calibrated decision
 *   < 0:  worse than predicted → regret, confidence was miscalibrated
 *
 * counterfactualScore: estimated outcome if no action had been taken.
 *   Approximated as 0 (no change) since we don't have a true control group.
 *   Nova interprets negative regret + negative counterfactual as "both paths were bad."
 *
 * thresholdTuningSuggestions: actionable policy adjustments for future decisions.
 *   These are NOT auto-applied — they surface in the boardroom UI for operator review.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type FinalOutcome = 'success' | 'failure' | 'neutral';
export type SizeRegret   = 'too_large' | 'too_small' | 'right_sized' | 'unknown';

export interface NovaDecisionRegretDocument extends Document {
  regretKey:     string;
  resolutionKey: string;
  portfolioKey?: string;
  actionType:    string;

  regretScore:          number;      // (actual - expected) / |expected|
  counterfactualScore:  number;      // estimated what no-action would have yielded
  sizeRegret:           SizeRegret;
  shouldHaveBeenBlocked: boolean;
  shouldHaveBeenLarger:  boolean;
  finalOutcome:         FinalOutcome;

  thresholdTuningSuggestions: string[];

  measuredAt:    Date;
  createdAt:     Date;
  updatedAt:     Date;
}

const NovaDecisionRegretSchema = new Schema<NovaDecisionRegretDocument>(
  {
    regretKey:     { type: String, required: true, unique: true, index: true },
    resolutionKey: { type: String, required: true, unique: true, index: true },
    portfolioKey:  { type: String, index: true },
    actionType:    { type: String, required: true, index: true },

    regretScore:           { type: Number, default: 0 },
    counterfactualScore:   { type: Number, default: 0 },
    sizeRegret:            { type: String, enum: ['too_large','too_small','right_sized','unknown'], default: 'unknown' },
    shouldHaveBeenBlocked:  { type: Boolean, default: false },
    shouldHaveBeenLarger:   { type: Boolean, default: false },
    finalOutcome:           { type: String, enum: ['success','failure','neutral'], default: 'neutral', index: true },

    thresholdTuningSuggestions: [String],
    measuredAt:    { type: Date, required: true },
  },
  { timestamps: true }
);

// Cognition loop: find regrets not yet used to tune thresholds
NovaDecisionRegretSchema.index({ actionType: 1, finalOutcome: 1 });

export const NovaDecisionRegret: Model<NovaDecisionRegretDocument> =
  (mongoose.models.NovaDecisionRegret as Model<NovaDecisionRegretDocument>) ||
  mongoose.model<NovaDecisionRegretDocument>('NovaDecisionRegret', NovaDecisionRegretSchema);

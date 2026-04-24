/**
 * models/boardroom/NovaPortfolioVote.ts
 *
 * A single vote on a strategic resolution.
 * voteKey: "{resolutionKey}::{voterId}::{YYYY-MM-DD}" — one vote per person per resolution per day.
 *   Prevents vote-stuffing from rapid re-clicks while allowing changed votes within a day.
 *
 * voterType:
 *   operator        → human decision maker
 *   system_signal   → Nova votes based on its own simulation quality
 *   authority_proxy → a delegated authority (e.g. a team lead acting for the org)
 *
 * weight: allows authority-weighted voting (senior operators can have weight > 1)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type VoterType  = 'operator' | 'system_signal' | 'authority_proxy';
export type VoteValue  = 'approve' | 'reject' | 'abstain';

export interface NovaPortfolioVoteDocument extends Document {
  voteKey:       string;
  resolutionKey: string;
  voterId:       string;
  voterType:     VoterType;
  vote:          VoteValue;
  weight:        number;
  rationale:     string;
  createdAt:     Date;
  updatedAt:     Date;
}

const NovaPortfolioVoteSchema = new Schema<NovaPortfolioVoteDocument>(
  {
    voteKey:       { type: String, required: true, unique: true, index: true },
    resolutionKey: { type: String, required: true, index: true },
    voterId:       { type: String, required: true, index: true },
    voterType:     { type: String, enum: ['operator','system_signal','authority_proxy'], required: true },
    vote:          { type: String, enum: ['approve','reject','abstain'], required: true, index: true },
    weight:        { type: Number, default: 1 },
    rationale:     { type: String, required: true },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

NovaPortfolioVoteSchema.index({ resolutionKey: 1, vote: 1 });

export const NovaPortfolioVote: Model<NovaPortfolioVoteDocument> =
  (mongoose.models.NovaPortfolioVote as Model<NovaPortfolioVoteDocument>) ||
  mongoose.model<NovaPortfolioVoteDocument>('NovaPortfolioVote', NovaPortfolioVoteSchema);

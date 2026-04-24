/**
 * models/pricing/NovaPricingProfile.ts
 *
 * Per-tenant pricing configuration.
 * basePrice is the anchor. currentPrice is what they pay now.
 * The engine only proposes — changes require explicit approval or satisfy auto-apply rules.
 *
 * NovaPricingProposal: every proposed adjustment is logged here.
 * The explanation field contains the client-facing rationale (never internal scores).
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type PricingMode = 'fixed' | 'performance' | 'hybrid';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'auto_applied' | 'expired';

export interface NovaPricingProfileDocument extends Document {
  tenantId:              string;
  pricingMode:           PricingMode;
  basePrice:             number;      // $ anchor (never changes without explicit reset)
  currentPrice:          number;      // $ what they pay today
  performanceMultiplier: number;      // sensitivity: 0.1 = 10% of score moves price 10%
  maxIncreasePct:        number;      // hard cap: 0.30 = max 30% above base
  maxDecreasePct:        number;      // hard floor: 0.20 = max 20% below base
  minDaysBetweenChanges: number;      // cooldown: default 30
  autoApplyIfIncreaseLt: number;      // auto-apply if increase < this $ amount
  lastAdjustedAt?:       Date;
  lastPerformanceScore?: number;
  agencyMarkup?:         number;      // $ added by agency before billing client
  currency:              string;      // 'USD'
  createdAt:             Date;
  updatedAt:             Date;
}

export interface NovaPricingProposalDocument extends Document {
  proposalKey:      string;           // tenantId::timestamp
  tenantId:         string;
  currentPrice:     number;
  proposedPrice:    number;
  delta:            number;           // proposedPrice - currentPrice
  deltaPct:         number;           // delta / currentPrice
  performanceScore: number;
  scoreComponents:  {
    roiWeight:          number;
    successRateWeight:  number;
    riskReductionWeight:number;
    consistencyWeight:  number;
    guaranteeBonus:     number;
  };
  explanation:      string;           // human-readable, client-safe
  status:           ProposalStatus;
  autoApplyEligible:boolean;
  approvedAt?:      Date;
  rejectedAt?:      Date;
  appliedAt?:       Date;
  createdAt:        Date;
}

const NovaPricingProfileSchema = new Schema<NovaPricingProfileDocument>(
  {
    tenantId:              { type: String, required: true, unique: true, index: true },
    pricingMode:           { type: String, enum: ['fixed','performance','hybrid'], default: 'hybrid' },
    basePrice:             { type: Number, required: true, default: 99 },
    currentPrice:          { type: Number, required: true, default: 99 },
    performanceMultiplier: { type: Number, default: 0.5 },  // moderate sensitivity
    maxIncreasePct:        { type: Number, default: 0.30 },
    maxDecreasePct:        { type: Number, default: 0.20 },
    minDaysBetweenChanges: { type: Number, default: 30 },
    autoApplyIfIncreaseLt: { type: Number, default: 15 },   // auto-apply if <$15 increase
    lastAdjustedAt:        { type: Date },
    lastPerformanceScore:  { type: Number },
    agencyMarkup:          { type: Number, default: 0 },
    currency:              { type: String, default: 'USD' },
  },
  { timestamps: true }
);

const NovaPricingProposalSchema = new Schema<NovaPricingProposalDocument>(
  {
    proposalKey:      { type: String, required: true, unique: true, index: true },
    tenantId:         { type: String, required: true, index: true },
    currentPrice:     { type: Number, required: true },
    proposedPrice:    { type: Number, required: true },
    delta:            { type: Number, required: true },
    deltaPct:         { type: Number, required: true },
    performanceScore: { type: Number, required: true },
    scoreComponents:  { type: Schema.Types.Mixed },
    explanation:      { type: String, required: true },
    status:           { type: String, enum: ['pending','approved','rejected','auto_applied','expired'], default: 'pending', index: true },
    autoApplyEligible:{ type: Boolean, default: false },
    approvedAt:       { type: Date },
    rejectedAt:       { type: Date },
    appliedAt:        { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NovaPricingProposalSchema.index({ tenantId: 1, createdAt: -1 });
NovaPricingProposalSchema.index({ status: 1, createdAt: -1 });

export const NovaPricingProfile: Model<NovaPricingProfileDocument> =
  (mongoose.models.NovaPricingProfile as Model<NovaPricingProfileDocument>) ||
  mongoose.model<NovaPricingProfileDocument>('NovaPricingProfile', NovaPricingProfileSchema);

export const NovaPricingProposal: Model<NovaPricingProposalDocument> =
  (mongoose.models.NovaPricingProposal as Model<NovaPricingProposalDocument>) ||
  mongoose.model<NovaPricingProposalDocument>('NovaPricingProposal', NovaPricingProposalSchema);

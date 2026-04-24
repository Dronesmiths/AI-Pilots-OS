/**
 * models/guarantee/NovaROIGuarantee.ts
 *
 * Tracks the outcome-based guarantee per tenant.
 * Baseline locked at onboarding. Progress measured daily.
 *
 * status lifecycle: active → met | failed | extended | credited
 *
 * eligibilityNotes: human-readable reasons if a tenant doesn't qualify
 * (e.g. "Traffic too low for reliable measurement")
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type GuaranteeType = 'traffic' | 'roi' | 'leads';
export type GuaranteeStatus = 'pending_baseline' | 'active' | 'met' | 'failed' | 'extended' | 'credited' | 'cancelled';

export interface NovaROIGuaranteeDocument extends Document {
  guaranteeKey:      string;          // tenantId::type::createdAt_ms
  tenantId:          string;
  guaranteeType:     GuaranteeType;
  targetPct:         number;          // e.g. 0.25 = 25% improvement
  baselineValue:     number;          // measured at start
  currentValue?:     number;          // last measured
  progressPct?:      number;          // (current - baseline) / baseline
  timeframeDays:     30 | 60 | 90;
  startsAt:          Date;
  endsAt:            Date;
  status:            GuaranteeStatus;
  failureResponse:   'credit' | 'extend' | 'partial_refund' | 'none';
  creditAmount?:     number;          // $ amount if credit response
  eligibilityNotes?: string[];        // reasons for ineligibility
  isEligible:        boolean;
  lastEvaluatedAt?:  Date;
  metAt?:            Date;
  failedAt?:         Date;
  createdAt:         Date;
  updatedAt:         Date;
}

// ── Daily progress snapshot ───────────────────────────────────────────────────
export interface NovaGuaranteeProgressDocument extends Document {
  tenantId:     string;
  guaranteeKey: string;
  date:         string;   // YYYY-MM-DD
  value:        number;
  progressPct:  number;
  onTrack:      boolean;  // is pace sufficient to meet target by endsAt?
}

const NovaROIGuaranteeSchema = new Schema<NovaROIGuaranteeDocument>(
  {
    guaranteeKey:    { type: String, required: true, unique: true, index: true },
    tenantId:        { type: String, required: true, index: true },
    guaranteeType:   { type: String, enum: ['traffic','roi','leads'], required: true },
    targetPct:       { type: Number, required: true },
    baselineValue:   { type: Number, required: true },
    currentValue:    { type: Number },
    progressPct:     { type: Number },
    timeframeDays:   { type: Number, enum: [30,60,90], default: 60 },
    startsAt:        { type: Date,   required: true },
    endsAt:          { type: Date,   required: true },
    status:          { type: String, enum: ['pending_baseline','active','met','failed','extended','credited','cancelled'], default: 'active', index: true },
    failureResponse: { type: String, enum: ['credit','extend','partial_refund','none'], default: 'extend' },
    creditAmount:    { type: Number },
    eligibilityNotes:{ type: [String] },
    isEligible:      { type: Boolean, default: true },
    lastEvaluatedAt: { type: Date },
    metAt:           { type: Date },
    failedAt:        { type: Date },
  },
  { timestamps: true }
);

const NovaGuaranteeProgressSchema = new Schema<NovaGuaranteeProgressDocument>(
  {
    tenantId:     { type: String, required: true, index: true },
    guaranteeKey: { type: String, required: true, index: true },
    date:         { type: String, required: true },
    value:        { type: Number, required: true },
    progressPct:  { type: Number, required: true },
    onTrack:      { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NovaGuaranteeProgressSchema.index({ guaranteeKey: 1, date: -1 });

export const NovaROIGuarantee: Model<NovaROIGuaranteeDocument> =
  (mongoose.models.NovaROIGuarantee as Model<NovaROIGuaranteeDocument>) ||
  mongoose.model<NovaROIGuaranteeDocument>('NovaROIGuarantee', NovaROIGuaranteeSchema);

export const NovaGuaranteeProgress: Model<NovaGuaranteeProgressDocument> =
  (mongoose.models.NovaGuaranteeProgress as Model<NovaGuaranteeProgressDocument>) ||
  mongoose.model<NovaGuaranteeProgressDocument>('NovaGuaranteeProgress', NovaGuaranteeProgressSchema);

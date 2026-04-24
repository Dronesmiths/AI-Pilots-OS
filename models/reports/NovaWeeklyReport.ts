/**
 * models/reports/NovaWeeklyReport.ts
 *
 * Stores weekly performance reports per tenant.
 * Each report is a full snapshot — html, narrative, and metrics —
 * so it can be resent, shown in the UI, or audited without recomputing.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export interface WeeklyMetrics {
  resolutionsApproved:  number;
  resolutionsRejected:  number;
  alertsTriggered:      number;
  alertsMitigated:      number;
  mitigationsApplied:   number;
  avgConfidence:        number;
  avgOutcomeScore:      number;
  roiChange:            number;       // +0.12 = +12%
  riskChange:           number;       // -0.08 = risk reduced 8%
  successRate:          number;
  topAction:            string;
  decisionsCount:       number;
}

export interface NovaWeeklyReportDocument extends Document {
  reportKey:       string;           // tenantId::YYYY-WW
  tenantId:        string;
  agencyId?:       string;
  tenantName:      string;
  dateRangeStart:  Date;
  dateRangeEnd:    Date;
  metrics:         WeeklyMetrics;
  narrative:       string;           // LLM-generated executive summary
  recommendations: string[];
  htmlSnapshot:    string;           // full rendered HTML for email
  emailSentTo?:    string;
  emailSentAt?:    Date;
  emailStatus:     'pending' | 'sent' | 'failed' | 'skipped';
  createdAt:       Date;
}

const MetricsSchema = new Schema<WeeklyMetrics>({
  resolutionsApproved:  { type: Number, default: 0 },
  resolutionsRejected:  { type: Number, default: 0 },
  alertsTriggered:      { type: Number, default: 0 },
  alertsMitigated:      { type: Number, default: 0 },
  mitigationsApplied:   { type: Number, default: 0 },
  avgConfidence:        { type: Number, default: 0 },
  avgOutcomeScore:      { type: Number, default: 0 },
  roiChange:            { type: Number, default: 0 },
  riskChange:           { type: Number, default: 0 },
  successRate:          { type: Number, default: 0 },
  topAction:            { type: String, default: '' },
  decisionsCount:       { type: Number, default: 0 },
}, { _id: false });

const NovaWeeklyReportSchema = new Schema<NovaWeeklyReportDocument>(
  {
    reportKey:       { type: String, required: true, unique: true, index: true },
    tenantId:        { type: String, required: true, index: true },
    agencyId:        { type: String, index: true },
    tenantName:      { type: String, default: '' },
    dateRangeStart:  { type: Date,   required: true },
    dateRangeEnd:    { type: Date,   required: true },
    metrics:         { type: MetricsSchema, default: () => ({}) },
    narrative:       { type: String, default: '' },
    recommendations: { type: [String], default: [] },
    htmlSnapshot:    { type: String, default: '' },
    emailSentTo:     { type: String },
    emailSentAt:     { type: Date },
    emailStatus:     { type: String, enum: ['pending','sent','failed','skipped'], default: 'pending', index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NovaWeeklyReportSchema.index({ tenantId: 1, createdAt: -1 });
NovaWeeklyReportSchema.index({ agencyId: 1, createdAt: -1 });

export const NovaWeeklyReport: Model<NovaWeeklyReportDocument> =
  (mongoose.models.NovaWeeklyReport as Model<NovaWeeklyReportDocument>) ||
  mongoose.model<NovaWeeklyReportDocument>('NovaWeeklyReport', NovaWeeklyReportSchema);

export default NovaWeeklyReport;

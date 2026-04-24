/**
 * models/WeeklyReport.ts
 *
 * One report per client per week.
 * Contains raw deltas, human narrative, highlights, and recommendations.
 * Used by the weekly proof engine + client dashboard.
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const WeeklyReportSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  weekStart: { type: Date, required: true, index: true },
  weekEnd:   { type: Date, required: true },
  weekLabel: { type: String, default: '' }, // e.g. "Apr 7–14, 2026"

  // Raw deltas
  metrics: {
    impressions: {
      current:  { type: Number, default: 0 },
      previous: { type: Number, default: 0 },
      delta:    { type: Number, default: 0 },
      deltaPct: { type: Number, default: 0 },
    },
    clicks: {
      current:  { type: Number, default: 0 },
      previous: { type: Number, default: 0 },
      delta:    { type: Number, default: 0 },
      deltaPct: { type: Number, default: 0 },
    },
    avgPosition: {
      current:  { type: Number, default: 0 },
      previous: { type: Number, default: 0 },
      delta:    { type: Number, default: 0 }, // negative = improving
    },
    newKeywordsTop10: { type: Number, default: 0 },
    pagesCreated:     { type: Number, default: 0 },
    linksAdded:       { type: Number, default: 0 },
  },

  // Human-readable wins (no jargon)
  narrative:       [{ type: String }],
  highlights:      [{ type: String }], // Big wins, formatted for email
  recommendations: [{ type: String }], // Next best actions

  // Pre-rendered HTML for email
  emailHtml: { type: String, default: '' },

  // Delivery tracking
  delivery: {
    emailSent:   { type: Boolean, default: false },
    emailSentAt: { type: Date },
    emailTo:     { type: String, default: '' },
    emailError:  { type: String, default: '' },
  },

  // Momentum snapshot at time of report
  momentumScore: { type: Number, default: 0 },
  momentumTrend: { type: String, default: 'flat' },

  isEstimated: { type: Boolean, default: false },
}, { timestamps: true });

WeeklyReportSchema.index({ tenantId: 1, clientId: 1, weekStart: -1 });

export type WeeklyReportDocument = InferSchemaType<typeof WeeklyReportSchema>;
export default mongoose.models.WeeklyReport ||
  mongoose.model('WeeklyReport', WeeklyReportSchema);

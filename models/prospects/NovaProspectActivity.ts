/**
 * models/prospects/NovaProspectActivity.ts
 *
 * Immutable behavior log per prospect.
 * Every open, click, page view, and demo interaction is recorded here.
 * intentScore is re-computed from this log on each update.
 *
 * activityKey: prospectId::type::timestamp_ms (unique per event)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type ActivityType = 'email_open' | 'email_click' | 'demo_view' | 'demo_page' | 'booking_click' | 'activate_click';

export interface NovaProspectActivityDocument extends Document {
  activityKey:  string;
  prospectId:   string;
  type:         ActivityType;
  metadata?: {
    emailSubject?: string;
    url?:          string;
    page?:         string;
    durationSecs?: number;    // time spent on demo
    sequenceStep?: number;
    ipHash?:       string;    // hashed for privacy
    userAgent?:    string;
  };
  createdAt: Date;
}

const NovaProspectActivitySchema = new Schema<NovaProspectActivityDocument>(
  {
    activityKey: { type: String, required: true, unique: true, index: true },
    prospectId:  { type: String, required: true, index: true },
    type:        { type: String, required: true, index: true },
    metadata:    { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NovaProspectActivitySchema.index({ prospectId: 1, createdAt: -1 });
NovaProspectActivitySchema.index({ prospectId: 1, type: 1 });

export const NovaProspectActivity: Model<NovaProspectActivityDocument> =
  (mongoose.models.NovaProspectActivity as Model<NovaProspectActivityDocument>) ||
  mongoose.model<NovaProspectActivityDocument>('NovaProspectActivity', NovaProspectActivitySchema);

// ── Intent score weights ──────────────────────────────────────────────────────
export const INTENT_WEIGHTS: Record<ActivityType, number> = {
  email_open:     1,
  email_click:    3,
  demo_view:      5,
  demo_page:      2,
  booking_click:  8,
  activate_click: 15,
};

// ── Recompute intent score from activity log ──────────────────────────────────
export async function recomputeIntentScore(prospectId: string): Promise<number> {
  const activities = await NovaProspectActivity.find({ prospectId }).lean();

  // Unique repeat visits: count demo_view events across days
  const viewDays = new Set(
    activities
      .filter(a => a.type === 'demo_view')
      .map(a => new Date(a.createdAt).toDateString())
  );
  const repeatBonus = Math.max(0, (viewDays.size - 1)) * 4;

  const base = activities.reduce((score, a) => {
    return score + (INTENT_WEIGHTS[a.type as ActivityType] ?? 0);
  }, 0);

  return Math.min(100, base + repeatBonus);
}

export default NovaProspectActivity;

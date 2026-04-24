/**
 * models/prospects/NovaProspect.ts
 *
 * Lead profile for the auto-close pipeline.
 * Created on lead capture. Updated as behavior is tracked.
 *
 * prospectId: slug from businessName (e.g. "palmdale-roofing")
 * demoTenantId: linked demo tenant (prefixed demo::)
 * intentScore: computed from behavior (opens×1 + clicks×3 + demoTime×5 + repeats×4)
 * status: drives which follow-up step fires next
 * sequenceStep: which email in the follow-up sequence was last sent (0-5)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type ProspectStatus = 'new' | 'demo_sent' | 'engaged' | 'hot' | 'closed_won' | 'closed_lost' | 'unsubscribed';

export interface NovaProspectDocument extends Document {
  prospectId:      string;
  name:            string;
  email:           string;
  businessName:    string;
  industry:        string;
  city?:           string;
  goal?:           string;   // grow_traffic | increase_conversions | stabilize | experiment
  demoTenantId?:   string;   // demo::[prospectId]
  demoNarrative?:  string;   // LLM-generated personalized story
  intentScore:     number;
  status:          ProspectStatus;
  sequenceStep:    number;   // last sent 0=initial, 1=reminder, 2=insight, 3=case, 4=close
  lastActivityAt?: Date;
  lastEmailSentAt?:Date;
  nextFollowUpAt?: Date;
  bookingUrl?:     string;
  activatedAt?:    Date;
  notes?:          string;
  source:          string;   // 'form' | 'manual' | 'cold' | 'api'
  agencyId?:       string;   // which agency this prospect belongs to
  createdAt:       Date;
  updatedAt:       Date;
}

const NovaProspectSchema = new Schema<NovaProspectDocument>(
  {
    prospectId:      { type: String, required: true, unique: true, index: true },
    name:            { type: String, default: '' },
    email:           { type: String, required: true, index: true },
    businessName:    { type: String, required: true },
    industry:        { type: String, default: 'other' },
    city:            { type: String },
    goal:            { type: String, enum: ['grow_traffic','increase_conversions','stabilize','experiment'], default: 'grow_traffic' },
    demoTenantId:    { type: String, index: true },
    demoNarrative:   { type: String },
    intentScore:     { type: Number, default: 0, index: true },
    status:          { type: String, enum: ['new','demo_sent','engaged','hot','closed_won','closed_lost','unsubscribed'], default: 'new', index: true },
    sequenceStep:    { type: Number, default: 0 },
    lastActivityAt:  { type: Date },
    lastEmailSentAt: { type: Date },
    nextFollowUpAt:  { type: Date, index: true },
    bookingUrl:      { type: String, default: 'https://tidycal.com/dronesmiths2/pandapro' },
    activatedAt:     { type: Date },
    notes:           { type: String },
    source:          { type: String, default: 'form' },
    agencyId:        { type: String },
  },
  { timestamps: true }
);

NovaProspectSchema.index({ status: 1, nextFollowUpAt: 1 });
NovaProspectSchema.index({ intentScore: -1, status: 1 });

export const NovaProspect: Model<NovaProspectDocument> =
  (mongoose.models.NovaProspect as Model<NovaProspectDocument>) ||
  mongoose.model<NovaProspectDocument>('NovaProspect', NovaProspectSchema);

export default NovaProspect;

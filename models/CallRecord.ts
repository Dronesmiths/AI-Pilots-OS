import mongoose, { Schema, InferSchemaType } from 'mongoose';

const CallRecordSchema = new Schema(
  {
    tenantId:               { type: String, required: true, index: true },
    source:                 { type: String, enum: ['twilio', 'vapi', 'manual'], required: true },
    externalCallId:         { type: String, index: true },
    externalConversationId: { type: String },
    from:                   { type: String },
    to:                     { type: String },
    startedAt:              { type: Date },
    endedAt:                { type: Date },
    durationSec:            { type: Number, default: 0 },
    transcript:             { type: String, default: '' },
    summary:                { type: String, default: '' },
    outcome: {
      type: String,
      enum: [
        'unknown',
        'booked',
        'qualified_lead',
        'missed_lead',
        'not_interested',
        'support_request',
        'followup_needed',
        'spam',
      ],
      default: 'unknown',
      index: true,
    },
    sentiment: {
      type: String,
      enum: ['positive', 'neutral', 'negative', 'mixed', 'unknown'],
      default: 'unknown',
    },
    confidence:     { type: Number, default: 0 },
    // Extracted intent signals (populated at ingest time)
    signals: {
      hasPricingIntent:  { type: Boolean, default: false },
      hasFollowupIntent: { type: Boolean, default: false },
      hasObjection:      { type: Boolean, default: false },
      hasHighIntent:     { type: Boolean, default: false },
    },
    metadata:       { type: Schema.Types.Mixed, default: {} },
    processed:      { type: Boolean, default: false, index: true },
    processedAt:    { type: Date },
    memoryId:       { type: String },
    activityLogged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CallRecordSchema.index({ tenantId: 1, createdAt: -1 });
CallRecordSchema.index({ tenantId: 1, outcome: 1, createdAt: -1 });

export type CallRecord = InferSchemaType<typeof CallRecordSchema>;

export default mongoose.models.CallRecord ||
  mongoose.model('CallRecord', CallRecordSchema);

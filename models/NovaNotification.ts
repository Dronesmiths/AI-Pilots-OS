/**
 * models/NovaNotification.ts
 *
 * Ground truth for every outbound notification Nova sends.
 * Covers: voice, sms, slack, email.
 * Includes retry tracking so failed messages can be resent.
 */

import { Schema, model, models } from 'mongoose';

const NovaNotificationSchema = new Schema(
  {
    type: {
      type:     String,
      enum:     ['voice','sms','slack','email'],
      required: true,
      index:    true,
    },

    subtype: {
      type:  String, // daily_briefing | stuck_spike | approval_backlog | campaign_failed | major_win | optimizer_shift
      index: true,
    },

    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', index: true },

    severity: {
      type:    String,
      enum:    ['info','warning','critical'],
      default: 'info',
      index:   true,
    },

    target: {
      phone:        { type: String, default: '' },
      slackChannel: { type: String, default: '' },
      email:        { type: String, default: '' },
    },

    content: {
      preview: { type: String, default: '' }, // first 200 chars
    },

    status: {
      type:    String,
      enum:    ['sent','failed','skipped'],
      default: 'sent',
      index:   true,
    },

    providerResponse: { type: Schema.Types.Mixed, default: {} },
    error:            { type: String, default: '' },

    // Retry tracking
    retryCount:  { type: Number, default: 0 },
    maxRetries:  { type: Number, default: 3 },
    nextRetryAt: { type: Date,   default: null },
    resolved:    { type: Boolean, default: false },

    // Correlation — links notification → approval action → audit
    correlationId: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

NovaNotificationSchema.index({ createdAt: -1 });
NovaNotificationSchema.index({ status: 1, nextRetryAt: 1 }); // retry worker query

export default models.NovaNotification || model('NovaNotification', NovaNotificationSchema);

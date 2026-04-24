/**
 * models/SeoActivityEvent.ts
 *
 * Immutable audit log of all engine actions + bandit decisions.
 * Written by drones on job start/complete/fail.
 * Written by campaigns on decisions and approvals.
 * Read by the dashboard activity feed + explain endpoints.
 * Never deleted — append-only.
 */

import { Schema, models, model } from 'mongoose';

const SeoActivityEventSchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clusterId: { type: Schema.Types.ObjectId, required: false, index: true },
    jobId:     { type: Schema.Types.ObjectId, required: false, index: true },

    type: {
      type: String,
      enum: [
        // Existing job events
        'job_queued',
        'job_started',
        'job_completed',
        'job_failed',
        // Completion events
        'reinforcement_completed',
        'boost_completed',
        'rebuild_completed',
        'publish_completed',
        'qa_completed',
        'enhancement_completed',
        'internal_links_completed',
        // AIRS
        'airs_flagged',
        'airs_recovered',
        // Decision events (bandit / gate layer)
        'job_pending_approval',
        'bandit_decision',
        'campaign_decision',
        'action_blocked',
        'action_auto_approved',
      ],
      required: true,
      index: true,
    },

    severity: {
      type: String,
      enum: ['info', 'success', 'warning', 'error'],
      default: 'info',
    },

    keyword:     { type: String, index: true },
    message:     { type: String, required: true },
    explanation: { type: String, default: '' },

    meta:             { type: Schema.Types.Mixed, default: {} },
    decisionContext:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Dashboard + explain read paths
SeoActivityEventSchema.index({ userId: 1, createdAt: -1 });
SeoActivityEventSchema.index({ createdAt: -1 });
SeoActivityEventSchema.index({ type: 1, createdAt: -1 });
SeoActivityEventSchema.index({ jobId: 1 });

export default models.SeoActivityEvent || model('SeoActivityEvent', SeoActivityEventSchema);

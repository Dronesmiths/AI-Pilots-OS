/**
 * models/SeoActionJob.ts
 *
 * Durable job queue for SEO operator actions.
 * Written by CRM dashboard / campaigns → polled and executed by drones.
 * Never overloads seoClusters with command state.
 *
 * Approval flow:
 *   pending_approval → human approves → queued → drones pick up
 *   pending_approval → human rejects  → cancelled
 * Drones ONLY poll status = 'queued'. Never 'pending_approval'.
 */

import { Schema, models, model } from 'mongoose';

const SeoActionJobSchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clusterId: { type: Schema.Types.ObjectId, required: false, index: true },

    action: {
      type: String,
      enum: ['reinforce', 'boost', 'rebuild', 'publish', 'qa', 'enhance', 'internal_links'],
      required: true,
      index: true,
    },

    // pending_approval = recommended but not yet cleared for drone execution
    status: {
      type: String,
      enum: ['pending_approval', 'queued', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },

    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal',
    },

    /** Numeric priority for reliable Mongo sort ordering. low=25 normal=50 high=75 urgent=100 */
    priorityScore: { type: Number, default: 50, index: true },

    source: {
      type: String,
      enum: ['dashboard', 'campaign', 'system', 'airs', 'bandit', 'drone'],
      default: 'dashboard',
      index: true,
    },

    keyword: { type: String, required: true, index: true },
    liveUrl: { type: String, default: null },

    payload: { type: Schema.Types.Mixed, default: {} },

    lockedAt:    { type: Date, default: null, index: true },
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },

    attempts:    { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },

    error:  { type: String, default: null },
    result: { type: Schema.Types.Mixed, default: null },

    // ── Approval system ────────────────────────────────────────────────
    approvalStatus: {
      type: String,
      enum: ['not_needed', 'pending', 'approved', 'rejected'],
      default: 'not_needed',
      index: true,
    },

    approvalReason: { type: String, default: '' },

    recommendedBy: {
      type: String,
      enum: ['dashboard', 'campaign', 'bandit', 'system'],
      default: 'dashboard',
    },
  },
  { timestamps: true }
);

// Hot-path composite indexes
SeoActionJobSchema.index({ status: 1, priorityScore: -1, createdAt: 1 });
SeoActionJobSchema.index({ userId: 1, keyword: 1, action: 1, status: 1 });
SeoActionJobSchema.index({ lockedAt: 1, status: 1 });
SeoActionJobSchema.index({ approvalStatus: 1, status: 1 });

export default models.SeoActionJob || model('SeoActionJob', SeoActionJobSchema);

/**
 * models/QueueJob.ts
 *
 * Lightweight job queue for the tenant activation pipeline.
 *
 * Separate from SeoActionJob (which is CRM-era, approval-flow, userId-keyed).
 * This model is tenantId-keyed (string slug) and carries simple typed jobs
 * that the drone fleet picks up.
 *
 * Drone poll pattern: find({ status: 'queued' }).sort({ priority: 1 })
 * Lower priority number = picked up first (consistent with existing drone patterns).
 *
 * Initial job types (seeded at activation):
 *   DISCOVERY    — keyword opportunity scan
 *   STRUCTURE    — site structure audit
 *   CONTENT_BATCH — first content generation batch
 *   INTERNAL_LINK — cross-link opportunity seeding
 */
import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const QueueJobSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    type: {
      type:     String,
      required: true,
      index:    true,
    },
    status: {
      type:    String,
      enum:    ['queued', 'running', 'done', 'failed', 'suspended'],
      default: 'queued',
      index:   true,
    },
    priority: { type: Number, default: 50, index: true },
    payload:  { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export type QueueJobDocument = InferSchemaType<typeof QueueJobSchema>;

const QueueJob: Model<QueueJobDocument> =
  mongoose.models.QueueJob || mongoose.model('QueueJob', QueueJobSchema);

export default QueueJob;

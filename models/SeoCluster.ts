import mongoose, { Schema, model, models } from 'mongoose';

const SeoClusterSchema = new Schema(
  {
    tenantId:      { type: String, required: true, index: true },
    category:      { type: String, required: true, enum: ['location', 'blog', 'cornerstone', 'qa', 'service', 'paa'] },
    keyword:       { type: String, required: true },
    status:        { type: String, required: true, enum: ['idle', 'queued', 'generating', 'published', 'Live'], default: 'queued' },
    scheduledTime: { type: Date, required: true },
    liveUrl:       { type: String, default: null },
    metadata:      { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

// Compound index for querying scheduled jobs by tenant and category efficiently
SeoClusterSchema.index({ tenantId: 1, category: 1, scheduledTime: 1 });

export const SeoCluster =
  models.SeoCluster ||
  model('SeoCluster', SeoClusterSchema);

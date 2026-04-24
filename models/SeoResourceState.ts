/**
 * models/SeoResourceState.ts
 *
 * Sliding 1-hour window tracking for rate limiting + conflict avoidance.
 * One document per window. Per-site state uses arrayFilters upsert (not naive $push).
 */

import { Schema, model, models } from 'mongoose';

const PerSiteSchema = new Schema({
  userId:           { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  commandsLastHour: { type: Number, default: 0 },
  lastActionAt:     { type: Date,   default: null },
  inFlightJobs:     { type: Number, default: 0 },
  lastActions:      [{ action: String, at: Date }],   // ring buffer — keep last 5
}, { _id: false });

const SeoResourceStateSchema = new Schema({
  windowStart: { type: Date, required: true, index: true },

  global: {
    commandsExecuted: { type: Number, default: 0 },
    campaignsRun:     { type: Number, default: 0 },
    jobsQueued:       { type: Number, default: 0 },
  },

  perSite: { type: [PerSiteSchema], default: [] },
}, { timestamps: true });

SeoResourceStateSchema.index({ windowStart: -1 });

export default models.SeoResourceState || model('SeoResourceState', SeoResourceStateSchema);

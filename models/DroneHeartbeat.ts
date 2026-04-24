/**
 * models/DroneHeartbeat.ts
 *
 * One document per drone — upserted on each EC2 ping.
 * Keeps the collection small: N drones = N documents forever.
 */
import mongoose, { Schema, model, models } from 'mongoose';

const DroneHeartbeatSchema = new Schema(
  {
    drone:           { type: String, required: true, unique: true, index: true },
    status:          { type: String, enum: ['ok', 'error', 'idle'], default: 'ok' },
    lastHeartbeatAt: { type: Date,   required: true },
    jobsProcessed:   { type: Number, default: 0 },
    queueDepth:      { type: Number, default: 0 },    // jobs still waiting after last cycle
    lastJobState:    { type: String, default: null },  // e.g. 'structured', 'templated'
    host:            { type: String, default: '' },
    version:         { type: String, default: '' },
    lastError:       { type: String, default: null },
    // Rolling 24-hour total (reset at midnight UTC)
    jobsToday:       { type: Number, default: 0 },
    jobsTodayDate:   { type: String, default: '' }, // YYYY-MM-DD
  },
  { timestamps: true }
);

export const DroneHeartbeat =
  models.DroneHeartbeat ||
  model('DroneHeartbeat', DroneHeartbeatSchema);

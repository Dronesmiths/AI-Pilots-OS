/**
 * models/governance/OperatorTrustSnapshot.ts
 *
 * Point-in-time trust state snapshot — written after every trust event.
 * Powers the trust history graph and trend analysis.
 *
 * Unlike OperatorTrustEvent (what happened), this captures the resulting state.
 * Schema is deliberately minimal: we store the outcome, not the cause.
 */

import mongoose, { Schema } from 'mongoose';

const OperatorTrustSnapshotSchema = new Schema({
  tenantId:   { type: String, index: true, required: true },
  operatorId: { type: String, index: true, required: true },

  // Trust state at time of snapshot
  score:      { type: Number, required: true },  // 0-100
  band:       { type: String, required: true },  // restricted|baseline|trusted|elevated|elite
  confidence: { type: Number, default: 0 },      // 0-1

  // Delegation state at time of snapshot
  grantLevel:   { type: String, default: 'none' },   // none|submit_only|execute_low|execute_medium
  maxRiskScore: { type: Number, default: 0 },

  // What triggered this snapshot
  triggerEventType: { type: String, required: true },
  triggerPositive:  { type: Boolean, default: true },
}, { timestamps: true });

// Key index for timeline queries  
OperatorTrustSnapshotSchema.index({ tenantId: 1, operatorId: 1, createdAt: 1 });
// Retention cron will use this to purge snapshots older than 90d
OperatorTrustSnapshotSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.models.OperatorTrustSnapshot ||
  mongoose.model('OperatorTrustSnapshot', OperatorTrustSnapshotSchema);

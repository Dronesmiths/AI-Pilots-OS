/**
 * models/onboarding/InstallJobLog.ts
 *
 * Append-only audit log for each install job step.
 * One log entry per step event (started, completed, failed, skipped).
 * Never updated — only inserted.
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const InstallJobLogSchema = new Schema({
  installJobId: { type: String, index: true, required: true },
  tenantId:     { type: String, index: true, required: true },
  clientId:     { type: String, index: true, required: true },

  step:     { type: String, required: true },
  status:   { type: String, required: true }, // started | completed | failed | skipped | warning
  message:  { type: String, default: '' },
  duration: { type: Number, default: 0 },     // ms for this step
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

InstallJobLogSchema.index({ installJobId: 1, createdAt: 1 });
// No updates on this collection — createdAt is immutable
InstallJobLogSchema.set('timestamps', { createdAt: true, updatedAt: false });

export type InstallJobLogDocument = InferSchemaType<typeof InstallJobLogSchema>;
export default mongoose.models.InstallJobLog ||
  mongoose.model('InstallJobLog', InstallJobLogSchema);

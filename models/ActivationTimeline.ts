/**
 * models/ActivationTimeline.ts
 *
 * Tracks real-time activation step progress per tenant.
 * Written by activateTenant() as each step runs/completes/errors.
 * Read by the admin UI to show the deployment-console view.
 *
 * One document per activation attempt (not per tenant — a tenant can
 * be re-activated, generating a new timeline each time).
 */
import mongoose from 'mongoose';

const ActivationStepSchema = new mongoose.Schema({
  step:    { type: String, required: true },
  status:  { type: String, enum: ['pending', 'running', 'done', 'error'], default: 'pending' },
  message: { type: String, default: '' },
  ts:      { type: Date },
}, { _id: false });

const ActivationTimelineSchema = new mongoose.Schema({
  tenantId:  { type: String, required: true, index: true },
  steps:     [ActivationStepSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.ActivationTimeline ||
  mongoose.model('ActivationTimeline', ActivationTimelineSchema);

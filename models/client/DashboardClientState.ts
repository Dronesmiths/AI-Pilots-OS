/**
 * models/client/DashboardClientState.ts
 *
 * One record per client domain. Tracks onboarding progress + autopilot preference.
 * Created on first POST to /api/onboarding/state, updated on each step.
 * Used by all dashboard APIs to identify the client via portal_domain cookie.
 */
import mongoose, { Schema } from 'mongoose';

const DashboardClientStateSchema = new Schema({
  domain: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },

  onboarding: {
    step:           { type: Number, default: 1, min: 1, max: 4 }, // 4 = complete
    gscConnected:   { type: Boolean, default: false },
    engineLaunched: { type: Boolean, default: false },
    completedAt:    { type: Date },
  },

  autopilotOn:   { type: Boolean, default: true },
  autopilotMode: { type: String,  default: 'balanced', enum: ['aggressive','balanced','safe'] },

  lastSeenAt: { type: Date, default: () => new Date() },
}, { timestamps: true });

export default mongoose.models.DashboardClientState ||
  mongoose.model('DashboardClientState', DashboardClientStateSchema);

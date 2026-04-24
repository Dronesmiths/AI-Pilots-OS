/**
 * models/Workspace.ts
 *
 * Top-level tenant container. Every site, goal, campaign, and job must belong to a workspace.
 * All cross-site operations should be scoped to workspaceId to prevent cross-client bleed.
 *
 * Plans: starter (3 sites, 50 cmds/day) | pro | agency | enterprise
 */

import { Schema, model, models } from 'mongoose';

const WorkspaceSchema = new Schema({
  name:    { type: String, required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  plan: {
    type: String,
    enum: ['starter','pro','agency','enterprise'],
    default: 'starter',
    index: true,
  },

  limits: {
    sites:          { type: Number, default: 3   },
    commandsPerDay: { type: Number, default: 50  },
    campaigns:      { type: Number, default: 2   },
    goalsPerSite:   { type: Number, default: 5   },
  },

  settings: {
    autopilotEnabled:   { type: Boolean, default: true  },
    shadowModeDefault:  { type: Boolean, default: false },
    operatorMode:       { type: String, enum: ['simple','advanced'], default: 'advanced' },
  },

  branding: {
    name:         { type: String, default: '' },
    logoUrl:      { type: String, default: '' },
    primaryColor: { type: String, default: '#1a1a2e' },
  },

  members: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    role:   { type: String, enum: ['owner','admin','operator','viewer'], default: 'viewer' },
  }],

  // ── Autonomy dial ──────────────────────────────────────────────────
  // Level 0: Manual | 1: Assisted (default) | 2: Managed | 3: Aggressive
  autonomy: {
    level: { type: Number, enum: [0,1,2,3], default: 1 },

    autoApprove: {
      lowRisk:    { type: Boolean, default: true  },
      mediumRisk: { type: Boolean, default: false },
      highRisk:   { type: Boolean, default: false },
    },

    thresholds: {
      lowRiskMinConfidence:    { type: Number, default: 0.70 },
      mediumRiskMinConfidence: { type: Number, default: 0.85 },
      highRiskMinConfidence:   { type: Number, default: 0.95 },
    },

    batching: {
      allowBatchAutoApproval: { type: Boolean, default: false },
      minBatchAvgScore:       { type: Number,  default: 0.80  },
      maxBatchSize:           { type: Number,  default: 10    },
    },

    safeguards: {
      neverAutoRunRebuild:     { type: Boolean, default: true },
      pauseOnHighErrorRate:    { type: Boolean, default: true },
      pauseOnAttributionDrop:  { type: Boolean, default: true },
    },
  },

  // ── Notification preferences ──────────────────────────────────────
  notifications: {
    phone:         { type: String, default: '' },
    slackWebhook:  { type: String, default: '' },
    dailyBriefing: { type: Boolean, default: false },
    voiceAlerts:   { type: Boolean, default: false },
    smsAlerts:     { type: Boolean, default: false },
  },

  // ── Notification intelligence ──────────────────────────────────────
  notificationPreferences: {
    // Quiet hours: e.g. start=22 end=7 = 10pm to 7am (cross-midnight supported)
    quietHours: {
      enabled: { type: Boolean, default: false },
      start:   { type: Number, default: 22 }, // 24h hour
      end:     { type: Number, default: 7  },
    },
    // Critical alerts (e.g. campaign failure) bypass quiet hours
    allowCriticalOverride: { type: Boolean, default: true },
  },


}, { timestamps: true });

WorkspaceSchema.index({ ownerId: 1 });

export default models.Workspace || model('Workspace', WorkspaceSchema);

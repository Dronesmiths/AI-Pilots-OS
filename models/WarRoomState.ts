/**
 * models/WarRoomState.ts
 *
 * The global / scoped war room state. One document per scope.
 * Unique by (scopeType, scopeKey) — upserted on every cycle.
 *
 * Fields autopilot reads at runtime:
 *   active                — is any crisis level active?
 *   level                 — determines constraint intensity
 *   requireApproval       — lockdown flag: autopilot skips all actions
 *   autopilotRestricted   — severe flag: reduce slots + force defensive posture
 *   explorationFrozen     — bandit flag: epsilon = 0
 *   spendCeilingFactor    — multiplier on availableBudget (0.0–1.0)
 */

import { Schema, model, models } from 'mongoose';

const WarRoomStateSchema = new Schema(
  {
    warRoomId: { type: String, required: true, unique: true },

    scopeType: {
      type: String,
      enum: ['global', 'tenant', 'cohort', 'domain'],
      required: true,
      index: true,
    },
    scopeKey: { type: String, required: true, index: true },

    level: {
      type:    String,
      enum:    ['normal', 'elevated', 'crisis', 'severe', 'lockdown'],
      default: 'normal',
      index:   true,
    },

    active: { type: Boolean, default: false },

    crisisTypes: [{ type: String }],  // 'treasury' | 'anomaly' | 'governance' | 'roi' | 'strategy'
    primaryCause: { type: String, default: null },

    // Runtime flags read by execution layers
    requireApproval:     { type: Boolean, default: false },   // lockdown: autopilot exits immediately
    autopilotRestricted: { type: Boolean, default: false },   // severe: reduce slots, force defensive
    explorationFrozen:   { type: Boolean, default: false },   // crisis+: bandits exploit only
    spendCeilingFactor:  { type: Number,  default: 1.0 },     // 0.0–1.0 multiplier on budget

    activatedAt:     { type: Date, default: null },
    lastEscalatedAt: { type: Date, default: null },
    resolvedAt:      { type: Date, default: null },

    // Escalation guard — how many consecutive scans at or above this level
    consecutiveScanCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WarRoomStateSchema.index({ scopeType: 1, scopeKey: 1 }, { unique: true });

export default models.WarRoomState || model('WarRoomState', WarRoomStateSchema);

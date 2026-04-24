/**
 * models/governance/GovernanceMetaStabilitySnapshot.ts
 *
 * System-wide stability health record — created on each meta-stability cycle.
 * Embeds all subsystem scores, alerts, and interventions in one document.
 * Each snapshot IS the audit entry — no separate AuditLog model needed.
 *
 * Score thresholds:
 *   ≥80 stable | ≥65 watch | ≥45 unstable | <45 critical
 */
import mongoose, { Schema } from 'mongoose';

const GovernanceMetaStabilitySnapshotSchema = new Schema({
  periodStart: { type: Date, required: true },
  periodEnd:   { type: Date, required: true },

  subsystemScores: {
    rubricStability:  { type: Number, default: 100 }, // 0–100
    banditStability:  { type: Number, default: 100 },
    priorStability:   { type: Number, default: 100 },
    controlStability: { type: Number, default: 100 },
  },

  // Health signals used to compute scores (for drill-down)
  subsystemSignals: {
    rubric: {
      driftScore:     { type: Number, default: 0 },
      maxOscillation: { type: Number, default: 0 },
      safetyErosion:  { type: Boolean, default: false },
      tuningStatus:   { type: String, default: 'normal' },
    },
    bandit: {
      harmfulRate:         { type: Number, default: 0 },
      rollbackCandidates:  { type: Number, default: 0 },
      liveBandits:         { type: Number, default: 0 },
      fragmentationScore:  { type: Number, default: 0 },
    },
    prior: {
      degradedCount:  { type: Number, default: 0 },
      totalPriors:    { type: Number, default: 0 },
      avgConfidence:  { type: Number, default: 0 },
    },
    control: {
      avgEffectiveness: { type: Number, default: 0 },
      recentHarmfulRate:{ type: Number, default: 0 },
    },
  },

  aggregate: {
    metaStabilityScore: { type: Number, default: 100 },
    interactionPenalty: { type: Number, default: 0 },
    status:             { type: String, default: 'stable', enum: ['stable','watch','unstable','critical'] },
    trend:              { type: String, default: 'stable', enum: ['improving','stable','declining'] },
  },

  alerts: [{
    _id: false,
    type:     String,
    severity: { type: String, enum: ['info','warning','critical'] },
    summary:  String,
  }],

  interventions: [{
    _id: false,
    action: String,
    target: String,
    reason: String,
  }],
}, { timestamps: true });

GovernanceMetaStabilitySnapshotSchema.index({ 'aggregate.status': 1, createdAt: -1 });

export default mongoose.models.GovernanceMetaStabilitySnapshot ||
  mongoose.model('GovernanceMetaStabilitySnapshot', GovernanceMetaStabilitySnapshotSchema);

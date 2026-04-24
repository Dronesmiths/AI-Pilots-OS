/**
 * models/governance/AnomalyResponseBandit.ts  (v4 — adds rewardMode)
 *
 * Lifecycle states:
 *   spawned         — created, <5 pulls, no meaningful data yet
 *   active          — learning in shadow mode (5–14 pulls)
 *   live            — controlling real responses (rollout mode = live_*)
 *   merge_candidate — flagged for collapse back into global
 *   merged          — collapsed; active=false; routing falls to global
 *   disabled        — manually turned off
 *
 * depth:  0 = global fallback bandit, 1 = contextual specialization
 * parentBanditId: ID of the global bandit this was spawned from
 */
import mongoose, { Schema } from 'mongoose';

const AnomalyResponseBanditSchema = new Schema({
  anomalyType: { type: String, index: true, required: true },
  scope:       { type: String, default: 'global' },
  scopeKey:    { type: String, default: 'global' },

  contextKey: { type: String, index: true, default: '' },
  context: {
    trustBand:    { type: String, default: 'global' },
    severityBand: { type: String, default: 'global' },
  },

  active: { type: Boolean, default: true },

  mode: {
    type: String, default: 'shadow',
    enum: ['shadow', 'live'],
  },

  // Reward function used for arm selection — changed only after human-approved promotion
  // live_reward          — standard: effectiveness × 0.50 + counterfactual × 0.40
  // causal_weighted_live — promoted: causal-weighted reward drives live selection
  rewardMode: {
    type: String, default: 'live_reward',
    enum: ['live_reward', 'causal_weighted_live'],
  },

  // Current active policy version number (matches RewardModePolicyVersion.versionNumber)
  currentVersionNumber: { type: Number, default: 1 },

  strategy: {
    type: String, default: 'epsilon_greedy',
    enum: ['epsilon_greedy', 'ucb1'],
  },

  settings: {
    epsilon:             { type: Number, default: 0.15 },
    minSamplesPerArm:    { type: Number, default: 5 },
    explorationEnabled:  { type: Boolean, default: true },
    ucbExplorationConst: { type: Number, default: 1.41 },
  },

  stats: {
    totalPulls: { type: Number, default: 0 },
    lastPullAt: { type: Date },
  },

  // Full lifecycle tracking
  lifecycle: {
    status: {
      type: String, default: 'spawned',
      enum: ['spawned', 'active', 'live', 'merge_candidate', 'merged', 'disabled'],
    },
    stageMeta: {
      firstPullAt:      { type: Date },
      lastPullAt:       { type: Date },
      totalPulls:       { type: Number, default: 0 },
      promotedToLiveAt: { type: Date },
      mergeCandidateAt: { type: Date },
      mergedAt:         { type: Date },
    },
    parentBanditId:       { type: String, default: '' }, // global parent
    depth:                { type: Number, default: 0  }, // 0=global, 1=contextual
    mergedIntoBanditId:   { type: String, default: '' }, // set when merged
  },

  // Contextual creation metadata + suppression
  creationMeta: {
    createdFrom:        { type: String, default: 'manual' },
    divergenceSnapshot: { type: Schema.Types.Mixed, default: {} },
    lastEvaluatedAt:    { type: Date },
    suppressedUntil:    { type: Date },
  },
}, { timestamps: true });

AnomalyResponseBanditSchema.index({ anomalyType: 1, active: 1 });
AnomalyResponseBanditSchema.index({ contextKey: 1, active: 1 });
AnomalyResponseBanditSchema.index({ 'lifecycle.status': 1 });
AnomalyResponseBanditSchema.index({ 'lifecycle.parentBanditId': 1 });

export default mongoose.models.AnomalyResponseBandit ||
  mongoose.model('AnomalyResponseBandit', AnomalyResponseBanditSchema);

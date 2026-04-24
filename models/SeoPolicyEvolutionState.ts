/**
 * models/SeoPolicyEvolutionState.ts
 *
 * Mutable policy configuration that the system can evolve over time.
 * Only safe numeric parameters — no code rewriting, no architecture changes.
 *
 * Phase 1 auto-promotes: bandit.epsilon, optimizer.goalWeights
 * Phase 2 (manual only): confidence_gate thresholds, budget_allocator multipliers
 */

import { Schema, model, models } from 'mongoose';

const SeoPolicyEvolutionStateSchema = new Schema({
  scopeType: { type: String, enum: ['global','campaign','user'], required: true, index: true },
  scopeId:   { type: String, required: true, index: true },
  policyType: {
    type:  String,
    enum:  ['optimizer','bandit','confidence_gate','budget_allocator'],
    required: true, index: true,
  },

  version: { type: Number, default: 1 },

  parameters: {
    // bandit
    epsilon: { type: Number, default: 0.15 },

    actionWeights: {
      boost:          { type: Number, default: 1.0 },
      reinforce:      { type: Number, default: 1.0 },
      internal_links: { type: Number, default: 1.0 },
      publish:        { type: Number, default: 1.0 },
    },

    // optimizer
    goalWeights: {
      urgency:     { type: Number, default: 0.45 },
      opportunity: { type: Number, default: 0.35 },
      reward:      { type: Number, default: 0.20 },
    },

    // confidence_gate (manual promotion only)
    confidenceThresholds: {
      boost:          { type: Number, default: 0.35 },
      reinforce:      { type: Number, default: 0.40 },
      internal_links: { type: Number, default: 0.45 },
      publish:        { type: Number, default: 0.55 },
    },

    // budget_allocator (manual promotion only)
    budgetMultipliers: {
      recovery:           { type: Number, default: 1.0 },
      expansion:          { type: Number, default: 1.0 },
      internal_authority: { type: Number, default: 1.0 },
      mixed_growth:       { type: Number, default: 1.0 },
    },
  },

  performance: {
    samples:              { type: Number, default: 0 },
    avgReward:            { type: Number, default: 0 },
    avgAccuracy:          { type: Number, default: 0 },
    avgAttributionScore:  { type: Number, default: 0 },
  },

  // 'active' = currently applied | 'testing' = candidate | 'retired' = replaced
  status: { type: String, enum: ['active','testing','retired'], default: 'active', index: true },
}, { timestamps: true });

SeoPolicyEvolutionStateSchema.index(
  { scopeType: 1, scopeId: 1, policyType: 1, status: 1 },
  { unique: true }
);

export default models.SeoPolicyEvolutionState ||
  model('SeoPolicyEvolutionState', SeoPolicyEvolutionStateSchema);

/**
 * models/governance/CommandRiskProfile.ts
 *
 * Per-commandType risk configuration. Drives scoreCommandRisk.ts.
 *
 * Each dimension is weighted 0-100 indicating contribution to final risk score.
 * Final score = weighted sum clamped to [0, 100].
 *
 * requiresTargetLock: execution must acquire a distributed lock on targetId.
 *
 * Seeded defaults are applied in scoreCommandRisk.ts when no profile found.
 */

import mongoose, { Schema } from 'mongoose';

const CommandRiskProfileSchema = new Schema(
  {
    commandType:              { type: String, index: true, required: true, unique: true },
    baseSeverity:             { type: Number, default: 10 },  // 0-100
    reversibility:            { type: Number, default: 10 },  // 0=irreversible, 100=fully reversible
    blastRadiusWeight:        { type: Number, default: 10 },  // how many targets affected
    productionImpactWeight:   { type: Number, default: 10 },  // live traffic/revenue impact
    policySensitivityWeight:  { type: Number, default: 10 },  // affects governance rules themselves
    requiresTargetLock:       { type: Boolean, default: true },
    active:                   { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.CommandRiskProfile ||
  mongoose.model('CommandRiskProfile', CommandRiskProfileSchema);

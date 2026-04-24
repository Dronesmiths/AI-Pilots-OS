/**
 * models/boardroom/NovaScenarioSimulation.ts
 *
 * Multi-scenario forward simulation for a proposed strategic resolution.
 * Models three futures: best, expected, worst — with probability weights that
 * sum to 1.0 (confidence values represent how likely each scenario is).
 *
 * aggregateScore: expected-value composite (best×0.2 + expected×0.6 + worst×0.2)
 *   This is the single number for ranking proposals when time is limited.
 *
 * simulationKey: deterministic "{resolutionKey}::scenario" — one per resolution.
 *   Re-running simulation updates (not duplicates) as board memory grows.
 *
 * precedentStrength: the average measured outcome score from board memory.
 *   0 = neutral history, positive = historically good action type, negative = bad.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export interface Scenario {
  label:        'best' | 'expected' | 'worst';
  roiChange:    number;   // expected ROI change (proxy: +0.3 = +30% improvement)
  riskChange:   number;   // risk delta (negative = risk drops = good)
  confidence:   number;   // probability weight for this scenario (best+exp+worst = 1.0)
  timeToImpact: number;   // days until impact measurable
}

export interface NovaScenarioSimulationDocument extends Document {
  simulationKey:     string;
  resolutionKey:     string;
  actionType:        string;
  scenarios:         Scenario[];
  aggregateScore:    number;
  precedentStrength: number;
  precedentCount:    number;
  createdAt:         Date;
  updatedAt:         Date;
}

const ScenarioSchema = new Schema<Scenario>(
  {
    label:        { type: String, enum: ['best', 'expected', 'worst'], required: true },
    roiChange:    { type: Number, default: 0 },
    riskChange:   { type: Number, default: 0 },
    confidence:   { type: Number, default: 0.33 },
    timeToImpact: { type: Number, default: 30 },
  },
  { _id: false }
);

const NovaScenarioSimulationSchema = new Schema<NovaScenarioSimulationDocument>(
  {
    simulationKey:     { type: String, required: true, unique: true, index: true },
    resolutionKey:     { type: String, required: true, unique: true, index: true },
    actionType:        { type: String, required: true },
    scenarios:         [ScenarioSchema],
    aggregateScore:    { type: Number, default: 0 },
    precedentStrength: { type: Number, default: 0 },
    precedentCount:    { type: Number, default: 0 },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

export const NovaScenarioSimulation: Model<NovaScenarioSimulationDocument> =
  (mongoose.models.NovaScenarioSimulation as Model<NovaScenarioSimulationDocument>) ||
  mongoose.model<NovaScenarioSimulationDocument>('NovaScenarioSimulation', NovaScenarioSimulationSchema);

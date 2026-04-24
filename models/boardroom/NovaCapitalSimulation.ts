/**
 * models/boardroom/NovaCapitalSimulation.ts
 *
 * A simulation run on a proposed strategic resolution before it goes to vote.
 * Computed from board memory (historical outcomes) + current portfolio state.
 *
 * simulationQuality: 0–1, confidence in the simulation itself.
 *   Driven by: how many historical precedents exist (more = higher quality).
 *   Low quality simulations are flagged in the UI.
 *
 * simulationKey: upsert-safe "{resolutionKey}::sim" — one simulation per resolution.
 *   Re-running simulation updates the existing record (fresh data in, same key).
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { ResolutionAction } from './NovaStrategicResolution';

export interface NovaCapitalSimulationDocument extends Document {
  simulationKey:          string;
  resolutionKey:          string;
  actionType:             ResolutionAction;
  precedentCount:         number;    // how many historical outcomes were used
  predictedROIChange:     number;    // expected change in portfolio ROI
  predictedRiskChange:    number;    // expected change in concentrationRisk (-=better)
  predictedConfidence:    number;    // confidence this action will succeed (0–1)
  predictedTimeToImpact:  number;    // days until impact visible
  precedentScore:         number;    // historical average outcomeScore for this actionType
  historicalSuccessRate:  number;    // fraction of past outcomes > 0
  simulationQuality:      number;    // how reliable this simulation is (0–1)
  createdAt:              Date;
  updatedAt:              Date;
}

const NovaCapitalSimulationSchema = new Schema<NovaCapitalSimulationDocument>(
  {
    simulationKey:         { type: String, required: true, unique: true, index: true },
    resolutionKey:         { type: String, required: true, unique: true, index: true },
    actionType:            { type: String, enum: ['scale','decrease','hold','merge','exit','approve','pause'], required: true },
    precedentCount:        { type: Number, default: 0 },
    predictedROIChange:    { type: Number, default: 0 },
    predictedRiskChange:   { type: Number, default: 0 },
    predictedConfidence:   { type: Number, default: 0.5 },
    predictedTimeToImpact: { type: Number, default: 30 },
    precedentScore:        { type: Number, default: 0 },
    historicalSuccessRate: { type: Number, default: 0 },
    simulationQuality:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const NovaCapitalSimulation: Model<NovaCapitalSimulationDocument> =
  (mongoose.models.NovaCapitalSimulation as Model<NovaCapitalSimulationDocument>) ||
  mongoose.model<NovaCapitalSimulationDocument>('NovaCapitalSimulation', NovaCapitalSimulationSchema);

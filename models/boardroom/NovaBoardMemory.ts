/**
 * models/boardroom/NovaBoardMemory.ts
 *
 * Persistent record of applied strategic resolutions and their measured outcomes.
 * This is the institutional memory that enables precedent-aware proposals and
 * capital simulation.
 *
 * Created at: applyStrategicResolution() — records the intent + predicted impact
 * Updated at: measureBoardMemoryOutcome() — records actual ROI change after impact window
 *
 * Fields:
 *   outcomeScore:     actual impact measured (positive = good, -1 to 1+ range)
 *   confidenceDelta:  actual - predicted confidence (positive = Nova was too conservative)
 *   timeToImpact:     days from application to measurable outcome
 *   measured:         whether the outcome has been assessed yet
 *   beforeROI,afterROI: portfolio ROI before and after (for outcome calculation)
 *
 * precedentScore (computed, not stored):
 *   getPrecedentInsights() aggregates outcoomeScore per actionType via MongoDB $group.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { ResolutionAction } from './NovaStrategicResolution';

export interface NovaBoardMemoryDocument extends Document {
  memoryKey:         string;
  resolutionKey:     string;
  portfolioKey?:     string;
  actionType:        ResolutionAction;
  predictedImpact:   number;
  outcomeScore:      number;     // actual vs expected (0 = neutral, >0 = better than expected)
  confidenceDelta:   number;     // actual success - predicted confidence (calibration)
  timeToImpact:      number;     // days
  beforeROI:         number;
  afterROI:          number;
  measured:          boolean;
  measureAt:         Date;       // when to check the outcome
  metadata?:         Record<string, unknown>;
  createdAt:         Date;
  updatedAt:         Date;
}

const NovaBoardMemorySchema = new Schema<NovaBoardMemoryDocument>(
  {
    memoryKey:       { type: String, required: true, unique: true, index: true },
    resolutionKey:   { type: String, required: true, unique: true, index: true }, // one memory per resolution
    portfolioKey:    { type: String, index: true },
    actionType:      { type: String, enum: ['scale','decrease','hold','merge','exit','approve','pause'], required: true, index: true },
    predictedImpact: { type: Number, default: 0 },
    outcomeScore:    { type: Number, default: 0 },
    confidenceDelta: { type: Number, default: 0 },
    timeToImpact:    { type: Number, default: 30 },
    beforeROI:       { type: Number, default: 0 },
    afterROI:        { type: Number, default: 0 },
    measured:        { type: Boolean, default: false, index: true },
    measureAt:       { type: Date, required: true, index: true },
    metadata:        { type: Schema.Types.Mixed },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

// Simulation query: all memories for a given actionType
NovaBoardMemorySchema.index({ actionType: 1, measured: 1 });
// Cognition loop: find unmeasured memories past their measureAt date
NovaBoardMemorySchema.index({ measured: 1, measureAt: 1 });

export const NovaBoardMemory: Model<NovaBoardMemoryDocument> =
  (mongoose.models.NovaBoardMemory as Model<NovaBoardMemoryDocument>) ||
  mongoose.model<NovaBoardMemoryDocument>('NovaBoardMemory', NovaBoardMemorySchema);

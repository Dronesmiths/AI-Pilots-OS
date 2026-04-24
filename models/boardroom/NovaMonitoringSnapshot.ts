/**
 * models/boardroom/NovaMonitoringSnapshot.ts
 *
 * Time-series snapshot of portfolio state after a resolution is applied.
 * Created at each monitoring window: 7, 14, 30, 60 days.
 *
 * scenarioMatch: which of the simulation scenarios actually materialized.
 *   Computed by comparing actual roiDrift to the predicted scenario ROI changes.
 *   Used by the regret engine to assess simulation accuracy.
 *
 * snapshotKey: deterministic "{resolutionKey}::snap::{windowDays}"
 *   One snapshot per resolution per window — upsert-safe.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type MonitoringWindow  = 7 | 14 | 30 | 60;
export type ScenarioMatch     = 'best' | 'expected' | 'worst' | 'undefined';

export interface NovaMonitoringSnapshotDocument extends Document {
  snapshotKey:    string;
  resolutionKey:  string;
  portfolioKey?:  string;
  windowDays:     MonitoringWindow;
  actualROI:      number;
  beforeROI:      number;
  roiDrift:       number;        // actualROI - beforeROI (positive = improving)
  actualRisk:     number;
  beforeRisk:     number;
  riskDrift:      number;        // actualRisk - beforeRisk (negative = improving)
  scenarioMatch:  ScenarioMatch;
  snapshotAt:     Date;
  createdAt:      Date;
  updatedAt:      Date;
}

const NovaMonitoringSnapshotSchema = new Schema<NovaMonitoringSnapshotDocument>(
  {
    snapshotKey:   { type: String, required: true, unique: true, index: true },
    resolutionKey: { type: String, required: true, index: true },
    portfolioKey:  { type: String, index: true },
    windowDays:    { type: Number, enum: [7, 14, 30, 60], required: true },
    actualROI:     { type: Number, default: 0 },
    beforeROI:     { type: Number, default: 0 },
    roiDrift:      { type: Number, default: 0 },
    actualRisk:    { type: Number, default: 0 },
    beforeRisk:    { type: Number, default: 0 },
    riskDrift:     { type: Number, default: 0 },
    scenarioMatch: { type: String, enum: ['best','expected','worst','undefined'], default: 'undefined' },
    snapshotAt:    { type: Date, required: true },
  },
  { timestamps: true }
);

// Cognition loop: find snapshots due for each resolution
NovaMonitoringSnapshotSchema.index({ resolutionKey: 1, windowDays: 1 });
// Regret engine: find all snapshots for a resolution in order
NovaMonitoringSnapshotSchema.index({ resolutionKey: 1, createdAt: 1 });

export const NovaMonitoringSnapshot: Model<NovaMonitoringSnapshotDocument> =
  (mongoose.models.NovaMonitoringSnapshot as Model<NovaMonitoringSnapshotDocument>) ||
  mongoose.model<NovaMonitoringSnapshotDocument>('NovaMonitoringSnapshot', NovaMonitoringSnapshotSchema);

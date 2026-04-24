/**
 * models/boardroom/NovaStrategicModeConfig.ts
 *
 * Singleton document (modeKey='global::mode') that tracks Nova's current strategic mode.
 * Mode affects threshold tolerances, mitigation aggressiveness, and autonomy levels.
 *
 * Modes:
 *   growth       — scale-tolerant, wider ROI acceptance, higher auto-approval threshold
 *   preservation — risk-first, lower concentration caps, require approval on scaling
 *   recovery     — aggressive mitigation, wider block scope, reduce before scaling
 *
 * The mode is read by:
 *   - evaluateDecisionThreshold (adjusts ROI/risk tolerances)
 *   - planMitigationForAnomaly  (adjusts mitigation aggressiveness)
 *   - War Room UI               (surface + toggle)
 *
 * setBy: who changed it ('operator', 'nova', 'cognition')
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type NovaStrategicMode = 'growth' | 'preservation' | 'recovery';

export interface NovaStrategicModeConfigDocument extends Document {
  modeKey:     string;
  mode:        NovaStrategicMode;
  description: string;
  setBy:       string;
  setAt:       Date;
  createdAt:   Date;
  updatedAt:   Date;
}

const NovaStrategicModeConfigSchema = new Schema<NovaStrategicModeConfigDocument>(
  {
    modeKey:     { type: String, required: true, unique: true, index: true },
    mode:        { type: String, enum: ['growth','preservation','recovery'], required: true },
    description: { type: String, default: '' },
    setBy:       { type: String, default: 'operator' },
    setAt:       { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const NovaStrategicModeConfig: Model<NovaStrategicModeConfigDocument> =
  (mongoose.models.NovaStrategicModeConfig as Model<NovaStrategicModeConfigDocument>) ||
  mongoose.model<NovaStrategicModeConfigDocument>('NovaStrategicModeConfig', NovaStrategicModeConfigSchema);

// ─── Read current mode (with default) ────────────────────────────────────────
export async function getCurrentStrategicMode(): Promise<NovaStrategicMode> {
  const doc = await NovaStrategicModeConfig.findOne({ modeKey: 'global::mode' }).lean();
  return doc?.mode ?? 'growth';  // default: growth
}

// ─── Set mode ─────────────────────────────────────────────────────────────────
export async function setStrategicMode(mode: NovaStrategicMode, setBy = 'operator', description = '') {
  return NovaStrategicModeConfig.findOneAndUpdate(
    { modeKey: 'global::mode' },
    { $set: { mode, setBy, description, setAt: new Date() } },
    { upsert: true, new: true }
  );
}

// ─── Mode behavior map (used by threshold engine + mitigation engine) ─────────
export const STRATEGIC_MODE_CONFIG: Record<NovaStrategicMode, {
  roiToleranceMultiplier:      number;  // applied to worstCaseROI threshold
  riskCapMultiplier:           number;  // applied to concentrationRisk cap
  autoApprovalScoreThreshold:  number;  // score must exceed this
  mitigationAggressiveness:    'low' | 'medium' | 'high';
}> = {
  growth:       { roiToleranceMultiplier: 1.20, riskCapMultiplier: 1.20, autoApprovalScoreThreshold: 0.65, mitigationAggressiveness: 'low'    },
  preservation: { roiToleranceMultiplier: 0.80, riskCapMultiplier: 0.80, autoApprovalScoreThreshold: 0.80, mitigationAggressiveness: 'medium' },
  recovery:     { roiToleranceMultiplier: 0.60, riskCapMultiplier: 0.60, autoApprovalScoreThreshold: 0.90, mitigationAggressiveness: 'high'   },
};

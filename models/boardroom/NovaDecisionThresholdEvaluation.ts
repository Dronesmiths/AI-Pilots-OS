/**
 * models/boardroom/NovaDecisionThresholdEvaluation.ts
 *
 * Per-resolution threshold gate result. Stores what was evaluated, what the
 * policy said, and what verdict was reached.
 *
 * evaluationKey: deterministic "{resolutionKey}::threshold" — upsert-safe.
 *   Re-running evaluation (e.g. after policy update) updates, not duplicates.
 *
 * exposureViolations: list of cap violations (empty = no exposure issues)
 * mandateApplied: the mandate type used when evaluating (for audit)
 * executionMode: 'instant' or 'staged' — set by threshold engine based on risk
 * stagePlan: embedded execution stages if executionMode = 'staged'
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { MandateType } from './NovaDecisionThresholdPolicy';

export type ThresholdVerdict  = 'auto_approve' | 'approve_for_vote' | 'human_review' | 'blocked';
export type ExecutionMode     = 'instant' | 'staged';

export interface ExecutionStage {
  stage:           number;
  allocationDelta: number;   // absolute dollar amount to deploy at this stage
  holdDays:        number;   // days to observe before advancing
  status:          'pending' | 'active' | 'completed';
  activatedAt?:    Date;
}

export interface NovaDecisionThresholdEvaluationDocument extends Document {
  evaluationKey:      string;
  resolutionKey:      string;
  policyKey:          string;
  mandateApplied:     MandateType;

  // Inputs evaluated
  expectedROI:       number;
  worstCaseROI:      number;
  expectedRisk:      number;
  worstCaseRisk:     number;
  confidence:        number;
  precedentStrength: number;
  successRate:       number;

  // Gate results
  passed:             boolean;
  verdict:            ThresholdVerdict;
  reasons:            string[];
  exposureViolations: string[];

  // Execution plan
  executionMode:      ExecutionMode;
  stagePlan:          ExecutionStage[];

  createdAt:         Date;
  updatedAt:         Date;
}

const ExecutionStageSchema = new Schema<ExecutionStage>(
  {
    stage:           { type: Number, required: true },
    allocationDelta: { type: Number, required: true },
    holdDays:        { type: Number, required: true },
    status:          { type: String, enum: ['pending','active','completed'], default: 'pending' },
    activatedAt:     Date,
  },
  { _id: false }
);

const NovaDecisionThresholdEvaluationSchema = new Schema<NovaDecisionThresholdEvaluationDocument>(
  {
    evaluationKey:      { type: String, required: true, unique: true, index: true },
    resolutionKey:      { type: String, required: true, unique: true, index: true },
    policyKey:          { type: String, required: true },
    mandateApplied:     { type: String, enum: ['growth','recovery','preservation','experiment'], required: true },
    expectedROI:        { type: Number, default: 0 },
    worstCaseROI:       { type: Number, default: 0 },
    expectedRisk:       { type: Number, default: 0 },
    worstCaseRisk:      { type: Number, default: 0 },
    confidence:         { type: Number, default: 0.5 },
    precedentStrength:  { type: Number, default: 0 },
    successRate:        { type: Number, default: 0.5 },
    passed:             { type: Boolean, default: false },
    verdict:            { type: String, enum: ['auto_approve','approve_for_vote','human_review','blocked'], required: true, index: true },
    reasons:            [String],
    exposureViolations: [String],
    executionMode:      { type: String, enum: ['instant','staged'], default: 'instant' },
    stagePlan:          [ExecutionStageSchema],
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

export const NovaDecisionThresholdEvaluation: Model<NovaDecisionThresholdEvaluationDocument> =
  (mongoose.models.NovaDecisionThresholdEvaluation as Model<NovaDecisionThresholdEvaluationDocument>) ||
  mongoose.model<NovaDecisionThresholdEvaluationDocument>('NovaDecisionThresholdEvaluation', NovaDecisionThresholdEvaluationSchema);

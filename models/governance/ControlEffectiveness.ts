/**
 * models/governance/ControlEffectiveness.ts
 *
 * Tracks whether a bounded auto-response actually worked.
 *
 * Lifecycle:
 *   1. Created (status: 'pending') when control is applied
 *      → baseline captured from the 1-hour window BEFORE the control
 *
 *   2. Updated (status: 'evaluated') when observationWindowEnd passes
 *      → outcome computed from the window DURING the control
 *
 * This turns every OperatorControlState into a measurable experiment:
 *   Before state → Control applied → After state → Effectiveness score
 *
 * Classification:
 *   effective    score >  0.15  — control demonstrably improved stability
 *   neutral      score  ±0.05   — no measurable effect
 *   ineffective  score > -0.25  — stability worsened slightly
 *   harmful      score ≤ -0.25  — control made things meaningfully worse
 */
import mongoose, { Schema } from 'mongoose';

const BaselineSchema = new Schema({
  capturedAt:         { type: Date, default: Date.now },
  avgTrustScore:      { type: Number, default: 50 },   // 0–100
  negativeEventCount: { type: Number, default: 0 },
  anomalyCount:       { type: Number, default: 0 },
}, { _id: false });

const OutcomeSchema = new Schema({
  avgTrustScore:      { type: Number, default: 0 },
  trustScoreDelta:    { type: Number, default: 0 },    // post − pre  (positive = good)
  negativeEventCount: { type: Number, default: 0 },
  negativeEventDelta: { type: Number, default: 0 },    // pre − post  (positive = good)
  newAnomalyCount:    { type: Number, default: 0 },    // anomalies fired DURING control
  stabilityScore:     { type: Number, default: 0 },
}, { _id: false });

const ControlEffectivenessSchema = new Schema({
  tenantId:   { type: String, index: true, required: true },
  operatorId: { type: String, index: true, required: true },

  controlStateId: { type: String, index: true, required: true },
  anomalyId:      { type: String, default: '' },
  controlType:    { type: String, required: true },

  status: {
    type: String, default: 'pending',
    enum: ['pending', 'evaluated'],
  },

  // The window being measured (= duration the control was active)
  observationWindowStart: { type: Date, required: true },
  observationWindowEnd:   { type: Date, required: true },

  baseline: { type: BaselineSchema, required: true },
  outcome:  { type: OutcomeSchema  },                  // null until evaluated

  // Composite score: -1.0 → +1.0  (null until evaluated)
  effectivenessScore: { type: Number },
  classification: {
    type: String,
    enum: ['effective', 'neutral', 'ineffective', 'harmful'],
  },
  evaluatedAt: { type: Date },
}, { timestamps: true });

// Primary sweep index for the cron evaluator
ControlEffectivenessSchema.index({ status: 1, observationWindowEnd: 1 });
// Dashboard query: all records for a tenant, filter by type or classification
ControlEffectivenessSchema.index({ tenantId: 1, controlType: 1, classification: 1 });
// Operator detail: all records for one operator
ControlEffectivenessSchema.index({ tenantId: 1, operatorId: 1, status: 1, createdAt: -1 });

export default mongoose.models.ControlEffectiveness ||
  mongoose.model('ControlEffectiveness', ControlEffectivenessSchema);

/**
 * models/governance/ControlCounterfactual.ts
 *
 * Causal inference record for every evaluated control.
 *
 * Answers the question: "Did the control actually help, or would things have
 * improved (or worsened) without it?"
 *
 * Method: slope-based projection of pre-control trust trend extrapolated forward
 * for the control duration. Simple, honest, explainable — no black box.
 *
 * Created by evaluateControlCounterfactual() after ControlEffectiveness is evaluated.
 */
import mongoose, { Schema } from 'mongoose';

const ControlCounterfactualSchema = new Schema({
  tenantId:   { type: String, index: true, required: true },
  operatorId: { type: String, index: true, required: true },

  controlStateId:         { type: String, index: true, required: true },
  controlEffectivenessId: { type: String, index: true, required: true },
  anomalyId:              { type: String, default: '' },
  controlType:            { type: String, required: true },
  anomalyType:            { type: String, required: true },

  baseline: {
    trustScore:        { type: Number, default: 50 },
    trustSlope:        { type: Number, default: 0 },    // pts/ms trend in baseline window
    negativeEventRate: { type: Number, default: 0 },    // events/hour in baseline window
    snapshotCount:     { type: Number, default: 0 },
  },

  counterfactualEstimate: {
    trustScoreDelta:               { type: Number, default: 0 }, // projected if no control
    negativeEventDelta:            { type: Number, default: 0 }, // projected (positive = more bad)
    anomalyPersistenceProbability: { type: Number, default: 0.5 },
  },

  actualOutcome: {
    trustScoreDelta:    { type: Number, default: 0 },
    negativeEventDelta: { type: Number, default: 0 },
    anomalyResolved:    { type: Boolean, default: false },
  },

  causalImpact: {
    trustBenefit:          { type: Number, default: 0 }, // actual - counterfactual (+ = control helped)
    eventReductionBenefit: { type: Number, default: 0 },
    resolutionLift:        { type: Number, default: 0 },
    overallImpactScore:    { type: Number, default: 0 }, // −1 → +1
  },

  confidence: {
    score:  { type: Number, default: 0 },                        // 0–1
    method: { type: String, default: 'slope_projection' },       // slope_projection | historical_match
    notes:  [{ type: String }],
  },

  evaluatedAt: { type: Date },
}, { timestamps: true });

ControlCounterfactualSchema.index({ tenantId: 1, operatorId: 1, createdAt: -1 });
ControlCounterfactualSchema.index({ tenantId: 1, controlType: 1, anomalyType: 1 });

export default mongoose.models.ControlCounterfactual ||
  mongoose.model('ControlCounterfactual', ControlCounterfactualSchema);

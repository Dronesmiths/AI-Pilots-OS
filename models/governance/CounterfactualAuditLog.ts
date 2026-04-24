/**
 * models/governance/CounterfactualAuditLog.ts
 *
 * Explainability record for every counterfactual simulation run.
 * Preserves what data was used, which method, and why confidence was low/high.
 */
import mongoose, { Schema } from 'mongoose';

const CounterfactualAuditLogSchema = new Schema({
  controlStateId:         { type: String, index: true, required: true },
  controlCounterfactualId:{ type: String, index: true },

  method:         { type: String, required: true }, // slope_projection | historical_match
  snapshotCount:  { type: Number, default: 0 },
  matchedCaseIds: [{ type: String }],               // for historical_match method

  summary:         { type: String, required: true },
  confidenceScore: { type: Number, default: 0 },
  notes:           [{ type: String }],
}, { timestamps: true });

export default mongoose.models.CounterfactualAuditLog ||
  mongoose.model('CounterfactualAuditLog', CounterfactualAuditLogSchema);

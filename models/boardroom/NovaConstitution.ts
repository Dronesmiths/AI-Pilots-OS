/**
 * models/boardroom/NovaConstitution.ts
 *
 * Singleton document (constitutionKey='global::constitution') that holds all
 * configurable, condition-evaluable rules governing Nova's autonomous actions.
 *
 * Rules are evaluated by evaluateGuardrails() before any action executes.
 *
 * condition: evaluates action.payload[field] against value using operator.
 *   If the field is missing from the payload, the rule is skipped (not triggered).
 *   This prevents false-positive blocking from missing data.
 *
 * priority: lower number = higher priority (1 is evaluated first).
 *   First 'block' rule wins — evaluation stops.
 *
 * actionTypes: ['*'] means all action types.
 * scopeTypes:  ['*'] means all scope types.
 *
 * Default rules seeded by seedDefaultConstitution():
 *   - block auto-approval when confidence < 0.30
 *   - require approval when exposure share > 0.60
 *   - warn when worst-case ROI < -0.40
 *   - block reduce_exposure when reductionPct > 0.25 (too aggressive)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type ConstitutionOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';
export type ConstitutionEnforcement = 'block' | 'require_approval' | 'warn';

export interface ConstitutionRule {
  ruleKey:     string;
  description: string;
  enabled:     boolean;
  actionTypes: string[];  // ['*'] = all
  scopeTypes:  string[];  // ['*'] = all
  condition: {
    field:    string;
    operator: ConstitutionOperator;
    value:    number | string | boolean;
  };
  enforcement: ConstitutionEnforcement;
  priority:    number;  // 1 = highest
}

export interface NovaConstitutionDocument extends Document {
  constitutionKey: string;
  rules:           ConstitutionRule[];
  createdAt:       Date;
  updatedAt:       Date;
}

const NovaConstitutionSchema = new Schema<NovaConstitutionDocument>(
  {
    constitutionKey: { type: String, required: true, unique: true, index: true },
    rules: [
      {
        ruleKey:     { type: String, required: true },
        description: { type: String, required: true },
        enabled:     { type: Boolean, default: true },
        actionTypes: [{ type: String }],
        scopeTypes:  [{ type: String }],
        condition: {
          field:    { type: String, required: true },
          operator: { type: String, enum: ['lt','lte','gt','gte','eq','neq'], required: true },
          value:    { type: Schema.Types.Mixed, required: true },
        },
        enforcement: { type: String, enum: ['block','require_approval','warn'], required: true },
        priority:    { type: Number, default: 1 },
      },
    ],
  },
  { timestamps: true }
);

export const NovaConstitution: Model<NovaConstitutionDocument> =
  (mongoose.models.NovaConstitution as Model<NovaConstitutionDocument>) ||
  mongoose.model<NovaConstitutionDocument>('NovaConstitution', NovaConstitutionSchema);

// ─── Seed helper (call once in app bootstrap or API route) ────────────────────
export async function seedDefaultConstitution() {
  const existing = await NovaConstitution.findOne({ constitutionKey: 'global::constitution' });
  if (existing) return existing;

  return NovaConstitution.create({
    constitutionKey: 'global::constitution',
    rules: [
      {
        ruleKey: 'no_low_confidence_auto_approve',
        description: 'Block auto-approval when decision confidence is below 30%.',
        enabled: true, actionTypes: ['auto_approve'], scopeTypes: ['*'],
        condition: { field: 'confidence', operator: 'lt', value: 0.30 },
        enforcement: 'block', priority: 1,
      },
      {
        ruleKey: 'cap_exposure_reduction',
        description: 'Block single reduction greater than 25% of allocation.',
        enabled: true, actionTypes: ['reduce_exposure'], scopeTypes: ['*'],
        condition: { field: 'reductionPct', operator: 'gt', value: 0.25 },
        enforcement: 'block', priority: 2,
      },
      {
        ruleKey: 'high_exposure_requires_approval',
        description: 'Require human approval when venture exposure share exceeds 60%.',
        enabled: true, actionTypes: ['*'], scopeTypes: ['venture'],
        condition: { field: 'exposureShare', operator: 'gt', value: 0.60 },
        enforcement: 'require_approval', priority: 3,
      },
      {
        ruleKey: 'warn_severe_worst_case',
        description: 'Warn when worst-case ROI is below -40%.',
        enabled: true, actionTypes: ['scale', 'merge'], scopeTypes: ['*'],
        condition: { field: 'worstCaseROI', operator: 'lt', value: -0.40 },
        enforcement: 'warn', priority: 4,
      },
    ],
  });
}

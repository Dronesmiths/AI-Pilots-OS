/**
 * models/boardroom/NovaMitigationPolicy.ts
 *
 * Controls what autonomous corrective actions Nova is allowed to take.
 * Conservative defaults based on the "safe first rollout" principle:
 *   ENABLED by default:  reduce_exposure, pause_execution, reopen_monitoring
 *   DISABLED by default: downgrade_autonomy, block_auto_approvals, freeze_domain
 *
 * maxMitigationsPerDay: hard rate cap — prevents runaway self-healing loops.
 * minSeverityToMitigate: only act on high/critical by default (not medium noise).
 * requireHumanApprovalForCritical: when true, plan mitigation but don't apply it
 *   automatically for critical anomalies — surfaces as 'proposed' for manual apply.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { AnomalySeverity } from './NovaAnomalyEvent';

export interface NovaMitigationPolicyDocument extends Document {
  policyKey:   string;
  scopeType:   'global' | 'portfolio' | 'venture';
  scopeKey:    string;
  // ── Override routing ───────────────
  tenantId?:     string;
  portfolioKey?: string;
  isDefault:     boolean;
  isEnabled:     boolean;

  // Which actions Nova can take autonomously
  allowAutoReduceExposure:     boolean;
  allowAutoPauseExecution:     boolean;
  allowAutoDowngradeAutonomy:  boolean;
  allowAutoBlockApprovals:     boolean;
  allowAutoReopenMonitoring:   boolean;
  allowAutoFreezeDomain:       boolean;

  // Limits
  maxExposureReductionPct: number;
  maxMitigationsPerDay:    number;

  minSeverityToMitigate:           AnomalySeverity;
  requireHumanApprovalForCritical: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const NovaMitigationPolicySchema = new Schema<NovaMitigationPolicyDocument>(
  {
    policyKey:    { type: String, required: true, unique: true, index: true },
    scopeType:    { type: String, enum: ['global','portfolio','venture'], required: true, index: true },
    scopeKey:     { type: String, required: true, index: true },
    // Override routing
    tenantId:     { type: String, index: true },
    portfolioKey: { type: String, index: true },
    isDefault:    { type: Boolean, default: false, index: true },
    isEnabled:    { type: Boolean, default: true,  index: true },

    // Safe defaults: only defensive, non-aggressive actions enabled
    allowAutoReduceExposure:    { type: Boolean, default: true  },
    allowAutoPauseExecution:    { type: Boolean, default: true  },
    allowAutoReopenMonitoring:  { type: Boolean, default: true  },
    allowAutoDowngradeAutonomy: { type: Boolean, default: false },
    allowAutoBlockApprovals:    { type: Boolean, default: false },
    allowAutoFreezeDomain:      { type: Boolean, default: false },

    maxExposureReductionPct:         { type: Number, default: 0.10 },
    maxMitigationsPerDay:            { type: Number, default: 10   },
    minSeverityToMitigate:           { type: String, enum: ['low','medium','high','critical'], default: 'high' },
    requireHumanApprovalForCritical: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NovaMitigationPolicySchema.index({ scopeType: 1, scopeKey: 1 });
NovaMitigationPolicySchema.index({ isDefault: 1, isEnabled: 1 });
NovaMitigationPolicySchema.index({ tenantId: 1, isEnabled: 1 });
NovaMitigationPolicySchema.index({ tenantId: 1, portfolioKey: 1, isEnabled: 1 });

export const NovaMitigationPolicy: Model<NovaMitigationPolicyDocument> =
  (mongoose.models.NovaMitigationPolicy as Model<NovaMitigationPolicyDocument>) ||
  mongoose.model<NovaMitigationPolicyDocument>('NovaMitigationPolicy', NovaMitigationPolicySchema);

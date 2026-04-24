/**
 * models/boardroom/NovaDecisionThresholdPolicy.ts
 *
 * Configurable risk/ROI/confidence policy that gates capital decisions.
 * Extended with mandate types (affects threshold adjustments) and
 * exposure caps (prevents overconcentration).
 *
 * mandateType defines the risk posture of this portfolio:
 *   growth:       tolerate more risk and weaker precedent for high upside
 *   recovery:     tight risk constraints, need consistent ROI
 *   preservation: highest bars across all metrics, minimal auto-approval
 *   experiment:   weak precedent ok, but exposure capped hard
 *
 * Exposure caps prevent good decisions from becoming dangerous concentrations:
 *   maxSingleVentureExposure:   max fraction of budget in one venture (0-1)
 *   maxDomainExposure:          max fraction in any one domain (e.g. seo, growth)
 *   maxAutoApprovedCapitalShift: max amount auto-approved in 30-day rolling window
 *   maxLowConfidenceExposure:   max budget under decisions with confidence < 0.65
 *
 * Policy hierarchy: venture → portfolio → global (more specific overrides)
 * Per-tenant override fields:
 *   isDefault=true + no tenantId    = global platform fallback
 *   tenantId + no portfolioKey      = tenant-level override
 *   tenantId + portfolioKey         = portfolio-level override
 *   Resolver merges: global → tenant → portfolio (deep merge, last wins)
 *
 * Policy hierarchy: portfolio → tenant → global → code defaults
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type MandateType  = 'growth' | 'recovery' | 'preservation' | 'experiment';
export type PolicyScope  = 'global' | 'portfolio' | 'venture';

export interface NovaDecisionThresholdPolicyDocument extends Document {
  policyKey:     string;
  scopeType:     PolicyScope;
  scopeKey:      string;
  // ── Override routing ──────────────────────────────────
  tenantId?:     string;       // undefined = platform-wide
  portfolioKey?: string;       // undefined = tenant-wide
  isDefault:     boolean;      // true = platform global fallback
  isEnabled:     boolean;      // false = soft-delete / temporarily disable
  mandateType:   MandateType;

  // ROI / performance thresholds
  minExpectedROI:         number;
  minConfidence:          number;
  maxWorstCaseRisk:       number;
  minPrecedentStrength:   number;
  minSuccessRate:         number;

  // Autonomy gates
  requireHumanReviewBelowConfidence: number;
  autoApproveAboveConfidence:        number;

  // Exposure caps
  maxSingleVentureExposure:   number;
  maxDomainExposure:          number;
  maxAutoApprovedCapitalShift: number;
  maxLowConfidenceExposure:   number;

  createdAt: Date;
  updatedAt: Date;
}

const NovaDecisionThresholdPolicySchema = new Schema<NovaDecisionThresholdPolicyDocument>(
  {
    policyKey:    { type: String, required: true, unique: true, index: true },
    scopeType:    { type: String, enum: ['global','portfolio','venture'], required: true, index: true },
    scopeKey:     { type: String, required: true, index: true },
    // Override routing fields
    tenantId:     { type: String, index: true },
    portfolioKey: { type: String, index: true },
    isDefault:    { type: Boolean, default: false, index: true },
    isEnabled:    { type: Boolean, default: true,  index: true },
    mandateType:  { type: String, enum: ['growth','recovery','preservation','experiment'], default: 'growth', index: true },

    minExpectedROI:              { type: Number, default: 0.05 },
    minConfidence:               { type: Number, default: 0.65 },
    maxWorstCaseRisk:            { type: Number, default: 0.25 },
    minPrecedentStrength:        { type: Number, default: 0.50 },
    minSuccessRate:              { type: Number, default: 0.60 },

    requireHumanReviewBelowConfidence: { type: Number, default: 0.55 },
    autoApproveAboveConfidence:        { type: Number, default: 0.90 },

    maxSingleVentureExposure:    { type: Number, default: 0.40 },
    maxDomainExposure:           { type: Number, default: 0.50 },
    maxAutoApprovedCapitalShift: { type: Number, default: 50   },
    maxLowConfidenceExposure:    { type: Number, default: 0.30 },
  },
  { timestamps: true }
);

// Existing scope index (preserved)
NovaDecisionThresholdPolicySchema.index({ scopeType: 1, scopeKey: 1 });
// Resolver indexes: global fallback, tenant override, portfolio override
NovaDecisionThresholdPolicySchema.index({ isDefault: 1, isEnabled: 1 });
NovaDecisionThresholdPolicySchema.index({ tenantId: 1, isEnabled: 1 });
NovaDecisionThresholdPolicySchema.index({ tenantId: 1, portfolioKey: 1, isEnabled: 1 });

export const NovaDecisionThresholdPolicy: Model<NovaDecisionThresholdPolicyDocument> =
  (mongoose.models.NovaDecisionThresholdPolicy as Model<NovaDecisionThresholdPolicyDocument>) ||
  mongoose.model<NovaDecisionThresholdPolicyDocument>('NovaDecisionThresholdPolicy', NovaDecisionThresholdPolicySchema);

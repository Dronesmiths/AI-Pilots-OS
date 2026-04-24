/**
 * models/SeoTrustState.ts
 *
 * Per-scope trust state for Nova's earned-autonomy system.
 * Scope: workspace | site | campaign.
 *
 * Trust is computed from real signals:
 *   - execution success rate
 *   - approval accept rate (human confidence in recommendations)
 *   - attribution confidence (did the action actually cause improvement?)
 *   - calibration confidence (is the ML well-calibrated here?)
 *   - recent error rate (safety brake)
 *
 * autoApproveEligible is derived — Nova earns it, never sets it directly.
 *   low-risk:    score ≥ 0.72, samples ≥ 8
 *   medium-risk: score ≥ 0.88, samples ≥ 15
 *   high-risk:   never auto-eligible
 */

import { Schema, model, models } from 'mongoose';

const ActionTrustSchema = new Schema(
  {
    action: {
      type:     String,
      enum:     ['boost','reinforce','internal_links','publish','enhance','rebuild'],
      required: true,
    },

    score:            { type: Number, default: 0.5 },  // 0–1
    samples:          { type: Number, default: 0 },

    successRate:      { type: Number, default: 0 },
    approvalRate:     { type: Number, default: 0 },
    attributionScore: { type: Number, default: 0 },
    calibrationScore: { type: Number, default: 0 },
    recentErrorRate:  { type: Number, default: 0 },

    autoApproveEligible: { type: Boolean, default: false },

    // Running streak for adaptive escalation
    consecutiveFailures: { type: Number, default: 0 },
    lastOutcome:         { type: String, enum: ['success','failure','unknown'], default: 'unknown' },

    notes: { type: String, default: '' },
  },
  { _id: false }
);

const SeoTrustStateSchema = new Schema(
  {
    scopeType: {
      type:     String,
      enum:     ['workspace','site','campaign'],
      required: true,
      index:    true,
    },

    scopeId: { type: String, required: true, index: true },

    overallScore: { type: Number, default: 0.5, index: true },

    actions: {
      type:    [ActionTrustSchema],
      default: () => [
        { action: 'boost'          },
        { action: 'reinforce'      },
        { action: 'internal_links' },
        { action: 'publish'        },
        { action: 'enhance'        },
        { action: 'rebuild'        },
      ],
    },

    metrics: {
      totalSamples:       { type: Number, default: 0 },
      totalApprovals:     { type: Number, default: 0 },
      totalAutoApprovals: { type: Number, default: 0 },
      totalFailures:      { type: Number, default: 0 },
      avgAttribution:     { type: Number, default: 0 },
      avgCalibration:     { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

SeoTrustStateSchema.index({ scopeType: 1, scopeId: 1 }, { unique: true });
SeoTrustStateSchema.index({ overallScore: -1 });

export default models.SeoTrustState || model('SeoTrustState', SeoTrustStateSchema);

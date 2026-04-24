/**
 * models/governance/ConstitutionalFederationModels.ts
 *
 * Five exports — one file.
 *
 * FederatedConstitutionalSignal      — sanitized governance telemetry shared from one Nova instance.
 *                                      Operates on governance abstractions only — never raw internals.
 *
 * ConstitutionalFederatedPrior       — aggregated governance recommendation derived from signals.
 *                                      Stores reusable priors: prefer_shadow, raise_approval_threshold, etc.
 *
 * SystemGovernanceProfile            — behavioral/posture profile of a Nova instance.
 *                                      Used for governance cohorting (high_autonomy, conservative, etc.)
 *
 * ConstitutionalFederationBlendRecord — explains how local + cohort + global weights were blended
 *                                       for a specific council proposal. Traceability artifact.
 *
 * ConstitutionalNetworkRollbackCase  — persisted case when a federated governance prior is causing
 *                                       harm across systems. Triggers network-wide dampening/rollback.
 *
 * ── Integration mapping (no duplication) ──────────────────────────────────────
 *   FederatedPolicyAggregate    → handles policy/mode federation; governance_prior enum exists
 *                                  but only stores approvalStrictnessShift — not constitutional
 *                                  recommendations. FederatedConstitutionalSignal is a different
 *                                  signal class at the constitutional (not policy) tier.
 *
 *   FederatedPolicyCandidate    → handles policy-tier promotable artifacts.
 *                                  ConstitutionalFederatedPrior is governance-tier: it stores
 *                                  prefer_shadow, block_change_class, raise_approval_threshold —
 *                                  not mode or action priors. Different concern, different schema.
 *
 *   evaluateFederatedRollback   → returns boolean + score for policy rollback.
 *                                  ConstitutionalNetworkRollbackCase is a persisted escalation
 *                                  case for when a constitutional prior is CAUSING harm across
 *                                  multiple systems — not just one tenant cohort.
 *
 *   SelfEvolutionConstitutionEvent → single-system audit trail per constitutional evaluation.
 *                                    FederatedConstitutionalSignal is the cross-system aggregate
 *                                    signal — many events → one sanitized signal.
 */

import mongoose, { Schema, Model } from 'mongoose';

const SIGNAL_TYPES       = ['rule_effectiveness', 'violation', 'near_miss', 'rollback', 'proposal_outcome', 'autonomy_adjustment', 'audit_result', 'simulation_miss'] as const;
const RECOMMENDATIONS    = ['prefer_shadow', 'prefer_limited_rollout', 'raise_approval_threshold', 'reduce_autonomy', 'increase_trace_requirement', 'block_change_class'] as const;
const SYSTEM_TYPES       = ['high_autonomy', 'conservative', 'high_mutation', 'low_realism', 'multi_tenant_diverse', 'topology_heavy', 'doctrine_heavy', 'federated_aggressive', 'recovery_sensitive'] as const;
const AUTONOMY_BANDS     = ['observe_only', 'shadow_only', 'limited_execute', 'full_execute'] as const;
const NETWORK_RB_STATUS  = ['open', 'shadow_rollback', 'dampened', 'rolled_back', 'dismissed'] as const;

// ── FederatedConstitutionalSignal ─────────────────────────────────────────────
// Abstract governance telemetry from a Nova instance. Never contains raw internals.
const FederatedConstitutionalSignalSchema = new Schema(
  {
    sourceSystemId: { type: String, required: true, index: true },

    signalType: {
      type: String, required: true, index: true,
      enum: SIGNAL_TYPES,
    },

    // Constitutional rule metadata (abstract — no raw rule content)
    ruleCategory: { type: String, default: '' },  // autonomy_limit | scope_limit | escalation_rule | trust_boundary | mutation_safety | explainability_requirement
    ruleTier:     { type: String, default: '' },  // immutable | strong_governance | adaptive_norm

    // Scope abstraction — what class of context did this happen in?
    scopeClass: {
      domain:       { type: String, default: '' },
      actionType:   { type: String, default: '' },
      systemType:   { type: String, default: '' },  // from SystemGovernanceProfile
      autonomyBand: { type: String, default: '' },  // from AutonomyProfile or SystemGovernanceProfile
    },

    // Outcome telemetry (abstract metrics — no tenant data)
    event: {
      rolloutType:        { type: String, default: '' },  // shadow | limited | global
      success:            { type: Boolean, default: true },
      regretScore:        { type: Number,  default: 0   },  // 0..1
      violationTriggered: { type: Boolean, default: false },
      rollbackOccurred:   { type: Boolean, default: false },
      auditSeverity:      { type: String,  default: 'low' },  // low | medium | high
    },

    // Which governance cohorts this system belongs to (for cohorting signals)
    cohortKeys: { type: [String], default: [] },

    // Privacy compliance flag — set to false and signal is excluded from aggregation
    privacySafe: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

FederatedConstitutionalSignalSchema.index({ sourceSystemId: 1, signalType: 1, createdAt: -1 });
FederatedConstitutionalSignalSchema.index({ 'scopeClass.systemType': 1, signalType: 1 });
FederatedConstitutionalSignalSchema.index({ cohortKeys: 1, createdAt: -1 });

const FederatedConstitutionalSignal: Model<any> =
  mongoose.models.FederatedConstitutionalSignal ||
  mongoose.model('FederatedConstitutionalSignal', FederatedConstitutionalSignalSchema);

// ── ConstitutionalFederatedPrior ──────────────────────────────────────────────
// Aggregated governance recommendation derived from multiple signals.
// Promoted priors feed into the local council as advisory input.
const ConstitutionalFederatedPriorSchema = new Schema(
  {
    priorKey:             { type: String, required: true, unique: true, index: true },
    scopeType:            { type: String, required: true, index: true, enum: ['global', 'cohort'] },
    scopeKey:             { type: String, required: true, index: true },     // cohort key or 'global'
    governancePatternKey: { type: String, required: true, index: true },     // e.g. 'simulation_trust_cap::high_autonomy'

    recommendation: {
      type: String, required: true, index: true,
      enum: RECOMMENDATIONS,
    },

    // Rule template — what constitutional change this prior recommends (abstract)
    ruleTemplate: { type: Schema.Types.Mixed, default: {} },

    // Evidence backing this prior
    evidence: {
      sampleSize:     { type: Number, default: 0 },
      successRate:    { type: Number, default: 0 },  // 0..1
      harmRate:       { type: Number, default: 0 },  // 0..1
      avgRegretDelta: { type: Number, default: 0 },  // negative = improvement
      rollbackRate:   { type: Number, default: 0 },  // 0..1
    },

    trustScore:       { type: Number, default: 0, index: true },   // 0..1
    promoted:         { type: Boolean, default: false, index: true },
    promotedAt:       { type: Date,    default: null  },

    // Version bumps on each evidence update (optimistic concurrency)
    version:          { type: Number, default: 1 },
  },
  { timestamps: true }
);

ConstitutionalFederatedPriorSchema.index({ scopeType: 1, scopeKey: 1, governancePatternKey: 1 }, { unique: true });
ConstitutionalFederatedPriorSchema.index({ promoted: 1, trustScore: -1 });

const ConstitutionalFederatedPrior: Model<any> =
  mongoose.models.ConstitutionalFederatedPrior ||
  mongoose.model('ConstitutionalFederatedPrior', ConstitutionalFederatedPriorSchema);

// ── SystemGovernanceProfile ───────────────────────────────────────────────────
// Describes the governance posture/behavior of one Nova instance.
// Used to assign cohortKeys for signal aggregation and prior application.
const SystemGovernanceProfileSchema = new Schema(
  {
    systemId: { type: String, required: true, unique: true, index: true },

    features: {
      systemType:               { type: String, default: 'conservative', enum: SYSTEM_TYPES },
      autonomyBand:             { type: String, default: 'shadow_only',  enum: AUTONOMY_BANDS },
      mutationRateBand:         { type: String, default: 'low'   },  // low | medium | high
      simulationTrustBand:      { type: String, default: 'medium' },  // low | medium | high
      tenantDiversityBand:      { type: String, default: 'low'   },  // low | medium | high
      governanceStrictnessBand: { type: String, default: 'strict' },  // strict | moderate | permissive
    },

    // Rolling governance metrics for this instance
    metrics: {
      violationRate:       { type: Number, default: 0 },   // violations / decisions
      rollbackRate:        { type: Number, default: 0 },   // rollbacks / changes
      avgAuditScore:       { type: Number, default: 1 },   // 0..1
      avgRegretScore:      { type: Number, default: 0 },   // 0..1
      autonomySuccessRate: { type: Number, default: 1 },   // 0..1
    },

    // Computed cohort assignments (derived from features + metrics)
    cohortKeys: { type: [String], default: [], index: true },

    lastUpdatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

SystemGovernanceProfileSchema.index({ 'features.systemType': 1, 'features.autonomyBand': 1 });

const SystemGovernanceProfile: Model<any> =
  mongoose.models.SystemGovernanceProfile ||
  mongoose.model('SystemGovernanceProfile', SystemGovernanceProfileSchema);

// ── ConstitutionalFederationBlendRecord ──────────────────────────────────────
// Traceability artifact — how local/cohort/global weights were blended for a proposal.
// One record per proposal that consulted federated priors.
const ConstitutionalFederationBlendRecordSchema = new Schema(
  {
    systemId:    { type: String, required: true, index: true },
    proposalKey: { type: String, required: true, index: true },  // ConstitutionalProposal.proposalKey

    // Blend weights (should sum to 1.0)
    localWeight:  { type: Number, default: 0 },
    cohortWeight: { type: Number, default: 0 },
    globalWeight: { type: Number, default: 0 },

    // Which priors were consulted
    appliedPriorKeys: { type: [String], default: [] },

    // What recommendation emerged from the blend
    finalRecommendation: { type: String, default: '' },
    rationale:           { type: String, default: '' },

    // Whether sovereignty guard fired (local overrode network)
    sovereigntyGuardFired: { type: Boolean, default: false },
  },
  { timestamps: true }
);

ConstitutionalFederationBlendRecordSchema.index({ proposalKey: 1, systemId: 1 });

const ConstitutionalFederationBlendRecord: Model<any> =
  mongoose.models.ConstitutionalFederationBlendRecord ||
  mongoose.model('ConstitutionalFederationBlendRecord', ConstitutionalFederationBlendRecordSchema);

// ── ConstitutionalNetworkRollbackCase ─────────────────────────────────────────
// Escalation case when a federated prior is confirmed as harmful across systems.
// Triggers the network rollback ladder (shadow → dampen → local-only → full rollback).
const ConstitutionalNetworkRollbackCaseSchema = new Schema(
  {
    priorKey:          { type: String, required: true, index: true },   // ConstitutionalFederatedPrior.priorKey
    priorId:           { type: String, required: true, index: true },

    affectedSystemIds: { type: [String], default: [] },
    affectedCohorts:   { type: [String], default: [] },

    // Evidence of harm
    evidence: {
      negativeTransferRate:  { type: Number, default: 0 },  // 0..1 — fraction of systems harmed
      violationLift:         { type: Number, default: 0 },  // delta in violation rate after prior applied
      regretLift:            { type: Number, default: 0 },  // delta in avg regret after prior applied
      rollbackCascadeCount:  { type: Number, default: 0 },  // how many systems triggered rollback
    },

    status: {
      type: String, required: true, default: 'open', index: true,
      enum: NETWORK_RB_STATUS,
    },

    recommendedAction: {
      type: String, default: 'shadow_rollback',
      // shadow_rollback | dampen_federated_weight | local_only_override | full_network_rollback | dismiss
    },

    reviewedAt:   { type: Date, default: null },
    resolvedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

ConstitutionalNetworkRollbackCaseSchema.index({ status: 1, createdAt: -1 });
ConstitutionalNetworkRollbackCaseSchema.index({ priorKey: 1, status: 1 });

const ConstitutionalNetworkRollbackCase: Model<any> =
  mongoose.models.ConstitutionalNetworkRollbackCase ||
  mongoose.model('ConstitutionalNetworkRollbackCase', ConstitutionalNetworkRollbackCaseSchema);

export {
  FederatedConstitutionalSignal,
  ConstitutionalFederatedPrior,
  SystemGovernanceProfile,
  ConstitutionalFederationBlendRecord,
  ConstitutionalNetworkRollbackCase,
};

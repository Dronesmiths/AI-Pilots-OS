/**
 * models/governance/LifecycleModels.ts
 *
 * Four exports — one file.
 *
 * SystemLifecycleState    — persistent state machine for a system's end-of-life
 *                           progression: active → degraded → sunset → archived → legacy.
 *                           DISTINCT from TenantLifecycleEvent which is an append-only
 *                           operational event stream covering activated/warming/warm/recovered.
 *                           SystemLifecycleState is a mutable state record that drives
 *                           stewardship decisions and blocks autonomous actions during
 *                           sunset/archived stages.
 *
 * StewardshipPlan         — the structured end-of-life action plan for a system or tenant.
 *                           Covers shutdown, handoff, merge, archive_only, doctrine_extraction.
 *                           Tracks which actions have been executed and their outcomes.
 *
 * LegacyArtifact          — a preserved intelligence artifact extracted from a retiring system.
 *                           Can be promoted to federated learning if anonymized. Types include
 *                           doctrine, pattern_memory, simulation_model, cluster_topology, case_history.
 *
 * FinalAuditReport        — the immutable closing governance record for a system lifecycle.
 *                           Created once at archival. References extracted doctrines, lessons
 *                           learned, compliance status, and full lifecycle metrics.
 *
 * ── Non-duplication map ───────────────────────────────────────────────────────
 *   TenantLifecycleEvent    → operational events (activated, warming, degraded, recovered)
 *   SystemLifecycleState    → EOL state machine (sunset, archived, legacy) — distinct concern
 *
 *   ConstitutionalChangeLog → records what changed in the constitution
 *   FinalAuditReport        → the closing governance summary for an entire system lifetime
 *
 *   CivilizationalLesson    → distilled lesson from multi-era governance patterns
 *   LegacyArtifact          → raw preserved intelligence from a specific retiring system
 *                             (may be promoted to CivilizationalLesson via federation pipeline)
 *
 *   SelfEvolutionConstitutionEvent → per-evaluation audit event (current, ongoing)
 *   FinalAuditReport               → closing summary across the full system lifecycle
 */

import mongoose, { Schema, Model } from 'mongoose';

const LIFECYCLE_STATES  = ['active', 'degraded', 'sunset', 'archived', 'legacy'] as const;
const PLAN_TYPES        = ['shutdown', 'handoff', 'merge', 'archive_only', 'doctrine_extraction'] as const;
const PLAN_STATUSES     = ['planned', 'in_progress', 'completed', 'aborted'] as const;
const ARTIFACT_TYPES    = ['doctrine', 'pattern_memory', 'simulation_model', 'cluster_topology', 'case_history'] as const;
const COMPLIANCE_STATUS = ['compliant', 'partial', 'non_compliant', 'waived'] as const;
const TRIGGER_REASONS   = ['churn', 'inactivity', 'catastrophic_failure', 'operator_initiated', 'scheduled_deprecation', 'version_replacement', 'tenant_acquisition'] as const;
const ACTION_STATUSES   = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;

// ── SystemLifecycleState ──────────────────────────────────────────────────────
// Persistent state machine — one record per system/tenant, updated on transitions.
// Blocks autonomous execution during sunset/archived states (enforced by policy layer).
const SystemLifecycleStateSchema = new Schema(
  {
    systemId: { type: String, default: null, index: true },  // Nova instance ID (if system-level)
    tenantId: { type: String, default: null, index: true },  // Tenant ID (if tenant-level)

    state: {
      type: String, required: true, default: 'active', index: true,
      enum: LIFECYCLE_STATES,
    },

    // The reason for the current state
    reason: { type: String, default: '' },

    // What triggered this lifecycle change
    triggers: {
      type: [String], default: [],
      // values from TRIGGER_REASONS
    },

    // Frozen flag — set during sunset/archived. Blocks all autonomous mutation.
    frozen: { type: Boolean, default: false, index: true },

    // Rollback window — system can be restored until this date
    rollbackWindowEndsAt: { type: Date, default: null },

    // Full transition history (append-only)
    transitionHistory: [{
      from:   { type: String, enum: LIFECYCLE_STATES },
      to:     { type: String, enum: LIFECYCLE_STATES },
      at:     { type: Date,  default: Date.now },
      reason: { type: String, default: '' },
      triggeredBy: { type: String, default: 'system' },  // operator | system | constitutional_council
    }],

    // Stewardship plan key (once issued)
    stewardshipPlanKey: { type: String, default: null },

    // Final audit report key (once generated)
    finalAuditKey: { type: String, default: null },
  },
  { timestamps: true }
);

SystemLifecycleStateSchema.index({ state: 1, frozen: 1 });
SystemLifecycleStateSchema.index({ tenantId: 1, state: 1 });
SystemLifecycleStateSchema.index({ systemId: 1, state: 1 });

const SystemLifecycleState: Model<any> =
  mongoose.models.SystemLifecycleState ||
  mongoose.model('SystemLifecycleState', SystemLifecycleStateSchema);

// ── StewardshipPlan ───────────────────────────────────────────────────────────
// Structured end-of-life action plan. Tracks action execution state.
// Created by buildStewardshipPlan, executed by executeStewardship.
const StewardshipPlanSchema = new Schema(
  {
    planKey:  { type: String, required: true, unique: true, index: true },
    systemId: { type: String, default: null, index: true },
    tenantId: { type: String, default: null, index: true },

    planType: {
      type: String, required: true,
      enum: PLAN_TYPES,
    },

    // Ordered list of actions with execution tracking
    actions: [{
      action:    { type: String, required: true },  // export_data | freeze_autopilot | extract_patterns | etc.
      status:    { type: String, default: 'pending', enum: ACTION_STATUSES },
      startedAt: { type: Date,  default: null },
      completedAt:{ type: Date, default: null },
      error:     { type: String, default: '' },
      result:    { type: Schema.Types.Mixed, default: {} },
    }],

    dataHandling: {
      export:          { type: Boolean, default: false },
      anonymize:       { type: Boolean, default: true  },
      deleteSensitive: { type: Boolean, default: false },  // requires explicit operator approval
    },

    ownershipTransfer: {
      newOwnerId:    { type: String, default: null },
      transferScope: { type: String, default: '' },
      transferredAt: { type: Date,  default: null },
    },

    // Rollback window duration (days) — populated from constitutional policy
    rollbackWindowDays: { type: Number, default: 30 },

    status: {
      type: String, required: true, default: 'planned', index: true,
      enum: PLAN_STATUSES,
    },

    completedAt: { type: Date, default: null },
    abortedAt:   { type: Date, default: null },
    abortReason: { type: String, default: '' },
  },
  { timestamps: true }
);

StewardshipPlanSchema.index({ status: 1, planType: 1 });
StewardshipPlanSchema.index({ tenantId: 1, status: 1 });

const StewardshipPlan: Model<any> =
  mongoose.models.StewardshipPlan ||
  mongoose.model('StewardshipPlan', StewardshipPlanSchema);

// ── LegacyArtifact ────────────────────────────────────────────────────────────
// Preserved intelligence from a retiring system.
// federatedEligible = true only after anonymization is confirmed.
// Can be promoted into CivilizationalLesson via the federation pipeline.
const LegacyArtifactSchema = new Schema(
  {
    artifactKey: { type: String, required: true, unique: true, index: true },
    systemId:    { type: String, default: null, index: true },
    tenantId:    { type: String, default: null, index: true },

    type: {
      type: String, required: true, index: true,
      enum: ARTIFACT_TYPES,
    },

    // Reference to the original source (pattern key, doctrine key, model ID, etc.)
    contentRef: { type: String, required: true },

    // Summarized content (operator-safe, structured sentences only — no raw chain-of-thought)
    summary: { type: String, default: '' },

    anonymized:         { type: Boolean, default: false, index: true },
    federatedEligible:  { type: Boolean, default: false, index: true },

    // If promoted to a civilizational lesson or doctrine
    promotedToKey: { type: String, default: null },
    promotedAt:    { type: Date,  default: null  },

    // Source system metrics at time of extraction (for quality scoring)
    sourceMetrics: {
      successRate:  { type: Number, default: 0 },
      regretScore:  { type: Number, default: 0 },
      occurrences:  { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

LegacyArtifactSchema.index({ type: 1, federatedEligible: 1 });
LegacyArtifactSchema.index({ tenantId: 1, type: 1, anonymized: 1 });

const LegacyArtifact: Model<any> =
  mongoose.models.LegacyArtifact ||
  mongoose.model('LegacyArtifact', LegacyArtifactSchema);

// ── FinalAuditReport ──────────────────────────────────────────────────────────
// Immutable closing governance record — created once at archival.
// Insert-only. If a system is reactivated after archival, a new report is NOT opened;
// instead a new SystemLifecycleState transition is appended and a note is added here.
const FinalAuditReportSchema = new Schema(
  {
    auditKey:  { type: String, required: true, unique: true, index: true },
    systemId:  { type: String, default: null, index: true },
    tenantId:  { type: String, default: null, index: true },

    summary: { type: String, required: true },

    metrics: {
      totalActions:      { type: Number, default: 0 },
      successRate:       { type: Number, default: 0 },  // 0..1
      regretScore:       { type: Number, default: 0 },  // 0..1
      anomaliesHandled:  { type: Number, default: 0 },
      violationRate:     { type: Number, default: 0 },  // 0..1
      rollbackCount:     { type: Number, default: 0 },
      governedDecisions: { type: Number, default: 0 },
      lifecycleDays:     { type: Number, default: 0 },  // total days from activation to archival
    },

    // Intelligence extracted during this lifecycle
    doctrineExtracted:   { type: [String], default: [] },  // ConstitutionalDoctrineArchive.doctrineKey
    lessonsLearned:      { type: [String], default: [] },  // human-readable sentences
    legacyArtifactKeys:  { type: [String], default: [] },  // LegacyArtifact.artifactKey

    complianceStatus: {
      type: String, default: 'compliant',
      enum: COMPLIANCE_STATUS,
    },
    complianceNotes: { type: String, default: '' },

    // Whether the system ended with a clean constitutional record
    constitutionallyClean: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Insert-only — no update indexes
FinalAuditReportSchema.index({ tenantId: 1, createdAt: -1 });
FinalAuditReportSchema.index({ complianceStatus: 1 });

const FinalAuditReport: Model<any> =
  mongoose.models.FinalAuditReport ||
  mongoose.model('FinalAuditReport', FinalAuditReportSchema);

export {
  SystemLifecycleState,
  StewardshipPlan,
  LegacyArtifact,
  FinalAuditReport,
};

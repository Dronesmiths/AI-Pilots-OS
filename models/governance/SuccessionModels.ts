/**
 * models/governance/SuccessionModels.ts
 *
 * Five exports — one file.
 *
 * SuccessionProfile           — describes a newly created or successor Nova instance.
 *                               Tracks origin type, parent system, archetype, and
 *                               which inheritance stage the system is currently in.
 *
 * InheritancePackage          — the structured bundle of inherited assets (rules,
 *                               doctrines, lessons, priors) and what is explicitly
 *                               blocked from automatic inheritance.
 *                               One package per tier per system (foundational to earned).
 *
 * BirthCharter               — the formal constitutional starting state of a new Nova.
 *                               Establishes autonomy level, required safeguards,
 *                               probation rules, escalation defaults, and warnings
 *                               from civilizational memory.
 *
 * InheritanceActivationRecord — append-only record of each capability unlock as the
 *                               system graduates through probation stages.
 *
 * SovereignDivergenceRecord   — tracks where the maturing Nova diverges from inherited
 *                               priors: local overrides, dampened lessons, deprecated
 *                               doctrines, or locally strengthened guidance.
 *
 * ── Non-duplication mapping ──────────────────────────────────────────────────
 *   SystemGovernanceProfile  → live posture profile of any Nova (updated continuously).
 *                              SuccessionProfile is the birth + maturation record —
 *                              created once at birth, tracks inheritance stage transitions.
 *
 *   ConstitutionalChangeLog  → immutable record of WHAT changed in the constitution.
 *   InheritanceActivationRecord → records WHICH inherited capability was unlocked and WHY —
 *                                  a different audit trail at the succession lifecycle layer.
 *
 *   ConstitutionalFederationBlendRecord → explains federation weight split for a proposal.
 *   SovereignDivergenceRecord           → explains where system chose to differ from its
 *                                         inherited baseline — divergence, not blending.
 */

import mongoose, { Schema, Model } from 'mongoose';

const ORIGIN_TYPES         = ['new_instance', 'cloned_instance', 'regional_successor', 'tenant_successor'] as const;
const INHERITANCE_STAGES   = ['birth', 'probation', 'limited_activation', 'mature'] as const;
const SYSTEM_TYPES_S       = ['high_autonomy', 'conservative', 'high_mutation', 'low_realism', 'multi_tenant_diverse', 'topology_heavy', 'doctrine_heavy', 'federated_aggressive', 'recovery_sensitive'] as const;
const AUTONOMY_BANDS_S     = ['observe_only', 'shadow_only', 'limited_execute', 'full_execute'] as const;
const MUTATION_SENSITIVITY = ['low', 'medium', 'high'] as const;
const PACKAGE_TIERS        = ['foundational', 'advisory', 'conditional', 'earned'] as const;
const ACTIVATION_MODES     = ['active', 'advisory_only', 'shadow_only', 'locked'] as const;
const CAPABILITY_TYPES     = ['autonomy_increase', 'federated_weight_increase', 'doctrine_activation', 'mutation_permission', 'policy_promotion_right'] as const;
const DIVERGENCE_TYPES     = ['local_override', 'dampened', 'deprecated_locally', 'strengthened_locally'] as const;
const INHERITED_SOURCE     = ['constitution', 'doctrine', 'lesson', 'prior'] as const;

// ── SuccessionProfile ─────────────────────────────────────────────────────────
const SuccessionProfileSchema = new Schema(
  {
    systemId: { type: String, required: true, unique: true, index: true },

    originType: {
      type: String, required: true,
      enum: ORIGIN_TYPES,
    },

    parentSystemId: { type: String, default: null, index: true },  // null for first-generation instances

    archetype: {
      systemType:          { type: String, default: 'conservative',  enum: SYSTEM_TYPES_S  },
      autonomyBand:        { type: String, default: 'shadow_only',   enum: AUTONOMY_BANDS_S },
      domainFocus:         { type: String, default: ''              },  // e.g. 'seo', 'crm', 'multi_tenant'
      tenantDiversityBand: { type: String, default: 'low'           },  // low | medium | high
      mutationSensitivity: { type: String, default: 'medium',        enum: MUTATION_SENSITIVITY },
    },

    inheritanceStage: {
      type: String, required: true, default: 'birth', index: true,
      enum: INHERITANCE_STAGES,
    },

    // Objective metrics at each stage evaluation
    stageHistory: [{
      stage:      { type: String, enum: INHERITANCE_STAGES },
      enteredAt:  { type: Date },
      auditScore: { type: Number },
      violationRate: { type: Number },
      regretScore:   { type: Number },
    }],

    birthAt:         { type: Date, default: Date.now },
    lastEvaluatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

SuccessionProfileSchema.index({ inheritanceStage: 1, birthAt: -1 });
SuccessionProfileSchema.index({ parentSystemId: 1, inheritanceStage: 1 });

const SuccessionProfile: Model<any> =
  mongoose.models.SuccessionProfile ||
  mongoose.model('SuccessionProfile', SuccessionProfileSchema);

// ── InheritancePackage ────────────────────────────────────────────────────────
// The structured bundle of inherited assets.
// A system can have multiple packages (one per tier: foundational + advisory + conditional).
// Earned tier is a separate package created when the system reaches 'limited_activation'.
const InheritancePackageSchema = new Schema(
  {
    packageKey: { type: String, required: true, unique: true, index: true },
    systemId:   { type: String, required: true, index: true },

    packageTier: {
      type: String, required: true, index: true,
      enum: PACKAGE_TIERS,
    },

    // What is inherited
    inheritedConstitutionRuleKeys: { type: [String], default: [] },  // SelfEvolutionConstitutionRule.ruleKey
    inheritedDoctrineKeys:         { type: [String], default: [] },  // ConstitutionalDoctrineArchive.doctrineKey
    inheritedLessonKeys:           { type: [String], default: [] },  // CivilizationalLesson.lessonKey
    inheritedPriorKeys:            { type: [String], default: [] },  // ConstitutionalFederatedPrior.priorKey

    // What is explicitly barred from this package
    // (disputed, under rollback review, or local-exception-only)
    blockedInheritanceKeys:        { type: [String], default: [] },
    blockedReasons:                { type: [String], default: [] },  // parallel to blockedInheritanceKeys

    activationMode: {
      type: String, required: true, default: 'locked',
      enum: ACTIVATION_MODES,
    },

    // Human+machine readable explanation of why this package has its contents
    rationale: { type: [String], default: [] },

    activatedAt: { type: Date, default: null },  // null until unlocked
  },
  { timestamps: true }
);

InheritancePackageSchema.index({ systemId: 1, packageTier: 1 });
InheritancePackageSchema.index({ systemId: 1, activationMode: 1 });

const InheritancePackage: Model<any> =
  mongoose.models.InheritancePackage ||
  mongoose.model('InheritancePackage', InheritancePackageSchema);

// ── BirthCharter ──────────────────────────────────────────────────────────────
// Formal constitutional starting state of a new Nova.
// One per system — created at birth, not updated (superseded by maturation records).
const BirthCharterSchema = new Schema(
  {
    charterKey: { type: String, required: true, unique: true, index: true },
    systemId:   { type: String, required: true, unique: true, index: true },

    autonomyLevel: {
      type: String, required: true,
      enum: AUTONOMY_BANDS_S,
    },

    requiredSafeguards: {
      traceRequired:                  { type: Boolean, default: true  },
      reflectionRequired:             { type: Boolean, default: true  },
      simulationRequiredForPromotion: { type: Boolean, default: true  },
      approvalRequiredForMutation:    { type: Boolean, default: true  },
      federatedWeightCap:             { type: Number,  default: 0.30  },  // 0..1 — max federated influence
      maxAutonomyBand:                { type: String,  default: 'shadow_only', enum: AUTONOMY_BANDS_S },
    },

    probationRules:     { type: [String], default: [] },
    escalationDefaults: { type: [String], default: [] },

    // Civilizational memory warnings surfaced at birth
    warnings: { type: [String], default: [] },

    // Which lessons/doctrines are flagged as critical warnings for this system's archetype
    criticalWarningKeys: { type: [String], default: [] },

    // The system may never graduate past this band without operator approval
    hardAutonomyCeiling: { type: String, default: 'full_execute', enum: AUTONOMY_BANDS_S },
  },
  { timestamps: true }
);

const BirthCharter: Model<any> =
  mongoose.models.BirthCharter ||
  mongoose.model('BirthCharter', BirthCharterSchema);

// ── InheritanceActivationRecord ───────────────────────────────────────────────
// Append-only record of each capability unlock.
// One record per unlock event — never updated.
const InheritanceActivationRecordSchema = new Schema(
  {
    recordKey: { type: String, required: true, unique: true, index: true },
    systemId:  { type: String, required: true, index: true },

    packageKey:    { type: String, required: true, index: true },  // InheritancePackage.packageKey
    packageTier:   { type: String, enum: PACKAGE_TIERS },

    capabilityType: {
      type: String, required: true,
      enum: CAPABILITY_TYPES,
    },

    previousState: { type: Schema.Types.Mixed, default: {} },
    newState:      { type: Schema.Types.Mixed, default: {} },

    // Evidence at the time of unlock
    evidenceSnapshot: {
      stage:         { type: String, enum: INHERITANCE_STAGES },
      auditScore:    { type: Number, default: 0 },
      violationRate: { type: Number, default: 0 },
      regretScore:   { type: Number, default: 0 },
    },

    triggerReason: { type: String, default: '' },
    activatedAt:   { type: Date,   required: true },
  },
  { timestamps: true }
);

InheritanceActivationRecordSchema.index({ systemId: 1, capabilityType: 1, activatedAt: -1 });
InheritanceActivationRecordSchema.index({ packageKey: 1, capabilityType: 1 });

const InheritanceActivationRecord: Model<any> =
  mongoose.models.InheritanceActivationRecord ||
  mongoose.model('InheritanceActivationRecord', InheritanceActivationRecordSchema);

// ── SovereignDivergenceRecord ─────────────────────────────────────────────────
// Tracks where a maturing Nova diverges from its inherited baseline.
// Sovereignty is allowed; divergence must be evidence-based.
// Accumulation of strengthened_locally records signals a system becoming self-governing.
const SovereignDivergenceRecordSchema = new Schema(
  {
    systemId: { type: String, required: true, index: true },

    inheritedSourceType: {
      type: String, required: true, index: true,
      enum: INHERITED_SOURCE,
    },

    inheritedKey: { type: String, required: true, index: true },  // the key of the inherited asset

    divergenceType: {
      type: String, required: true, index: true,
      enum: DIVERGENCE_TYPES,
    },

    rationale: { type: String, default: '' },  // evidence-based justification

    // Supporting evidence for this divergence
    evidence: {
      localOccurrenceCount: { type: Number, default: 0 },
      localViolationRate:   { type: Number, default: 0 },
      localRegretDelta:     { type: Number, default: 0 },  // negative = improvement
      inheritedHarmRate:    { type: Number, default: 0 },  // harm rate when inherited asset applied locally
    },

    // Whether a council or operator reviewed this divergence
    reviewed:   { type: Boolean, default: false, index: true },
    reviewedAt: { type: Date,   default: null  },
  },
  { timestamps: true }
);

SovereignDivergenceRecordSchema.index({ systemId: 1, divergenceType: 1, createdAt: -1 });
SovereignDivergenceRecordSchema.index({ systemId: 1, inheritedKey: 1 });
SovereignDivergenceRecordSchema.index({ divergenceType: 1, reviewed: 1 });

const SovereignDivergenceRecord: Model<any> =
  mongoose.models.SovereignDivergenceRecord ||
  mongoose.model('SovereignDivergenceRecord', SovereignDivergenceRecordSchema);

export {
  SuccessionProfile,
  InheritancePackage,
  BirthCharter,
  InheritanceActivationRecord,
  SovereignDivergenceRecord,
};

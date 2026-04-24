/**
 * models/governance/ConstitutionalEvolutionModels.ts
 *
 * Four exports — one file.
 *
 * ConstitutionalProposal        — a proposed change to the constitution, triggered by
 *                                  reflection patterns, violation clusters, or performance evidence.
 *                                  Lifecycle: proposed → in_review → simulating → approved/rejected/shadow
 *
 * CouncilVote                   — one vote from one council role for a proposal.
 *                                  6 roles: safety_guardian, performance_advocate, learning_analyst,
 *                                  federated_advisor, simulation_validator, constitution_arbiter
 *
 * ConstitutionalSimulationResult — sandbox test result for a proposal before any rollout.
 *                                  Required for approval_required and high_governance tiers.
 *
 * ConstitutionalChangeLog        — immutable record of an applied constitutional change,
 *                                  including oldValue, newValue, rolloutType, and post-rollout outcome.
 *                                  Insert-only — never update.
 *
 * ── Integration mapping (no duplication) ──────────────────────────────────
 *   SelfEvolutionConstitutionRule   → still IS the constitutional law tier + protection rules
 *   ProtectedSystemTarget           → still IS the registry of what can change and by how much
 *   SelfEvolutionConstitutionEvent  → still IS the per-evaluation audit log
 *   evaluateSelfEvolutionConstitution → still IS the pure constitutional gate
 *
 *   ConstitutionalProposal is NEW: it wraps a proposal object that feeds
 *   into evaluateSelfEvolutionConstitution, so the council debate → single gate flow works.
 *
 *   CouncilVote is NEW: it adds the multi-role opinion layer BEFORE the
 *   constitutional gate — council produces a recommended verdict, then
 *   evaluateSelfEvolutionConstitution still enforces the hard constitution rules.
 *
 *   ConstitutionalSimulationResult is NEW: links to NovaSimulationRun via
 *   simulationRunId but stores constitutional-specific metrics (riskIncrease,
 *   regretDelta, violationsTriggered — not in NovaSimulationRun schema).
 *
 *   ConstitutionalChangeLog is NEW: SelfEvolutionConstitutionEvent records
 *   the evaluation, but not the old/new state transition or post-rollout outcome.
 */

import mongoose, { Schema, Model } from 'mongoose';

const PROPOSAL_STATUS = ['proposed', 'in_review', 'simulating', 'approved', 'rejected', 'shadow_rollout', 'promoted', 'rolled_back'] as const;
const PROPOSAL_TYPES  = ['rule_addition', 'rule_modification', 'rule_removal', 'threshold_adjustment'] as const;
const COUNCIL_ROLES   = ['safety_guardian', 'performance_advocate', 'learning_analyst', 'federated_advisor', 'simulation_validator', 'constitution_arbiter'] as const;
const COUNCIL_VOTES   = ['approve', 'reject', 'shadow', 'limit'] as const;
const COUNCIL_VERDICT = ['approve', 'reject', 'shadow', 'limit'] as const;
const ROLLOUT_TYPES   = ['global', 'cohort', 'shadow', 'limited'] as const;

// ── ConstitutionalProposal ────────────────────────────────────────────────────
const ConstitutionalProposalSchema = new Schema(
  {
    proposalKey:   { type: String, required: true, unique: true, index: true },
    targetKey:     { type: String, required: true, index: true  },  // ProtectedSystemTarget.targetKey
    targetArea:    { type: String, required: true, index: true  },  // ProtectedSystemTarget.targetArea

    type: {
      type: String, required: true, index: true,
      enum: PROPOSAL_TYPES,
    },

    proposedChange: { type: Schema.Types.Mixed, default: {} },  // the actual delta being proposed
    proposedValue:  { type: Schema.Types.Mixed, default: null }, // for numeric targets: new value

    reason:  { type: String, default: '' },  // human-readable trigger reason

    // Evidence that triggered this proposal — linked to existing records
    evidence: {
      reflectionPatternKeys: { type: [String], default: [] },  // DecisionReplayLearningEvent keys
      violationCaseIds:      { type: [String], default: [] },  // ConstitutionalViolation._id strings
      performanceImpact:     { type: Number,   default: 0  },  // 0..1 estimated gain/loss
    },

    status: {
      type: String, required: true, default: 'proposed', index: true,
      enum: PROPOSAL_STATUS,
    },

    // How large is this change (magnitude = |newValue - currentValue| / currentValue, or 0..1)
    requestedChangeMagnitude: { type: Number, default: 0 },
    hasShadowEvidence:        { type: Boolean, default: false },

    // Final council recommendation (set by aggregateCouncilDecision)
    councilVerdict: {
      type: String, default: null, index: true,
      enum: [...COUNCIL_VERDICT, null],
    },
    councilScore:   { type: Number, default: 0 },  // weighted vote score

    // Constitutional gate result (set by evaluateSelfEvolutionConstitution)
    constitutionalVerdict: {
      type: String, default: null, index: true,
    },

    // Simulation reference (set when simulating)
    simulationResultId: { type: String, default: null, index: true },

    // Applied change reference (set when change is executed)
    changeLogId: { type: String, default: null, index: true },

    // Who or what triggered the proposal
    triggeredBy: {
      type: String, default: 'reflection_engine',
      // 'reflection_engine' | 'violation_cluster' | 'performance_plateau' | 'federated_signal' | 'operator'
    },
  },
  { timestamps: true }
);

ConstitutionalProposalSchema.index({ status: 1, createdAt: -1 });
ConstitutionalProposalSchema.index({ targetArea: 1, status: 1 });
ConstitutionalProposalSchema.index({ councilVerdict: 1, constitutionalVerdict: 1 });

const ConstitutionalProposal: Model<any> =
  mongoose.models.ConstitutionalProposal ||
  mongoose.model('ConstitutionalProposal', ConstitutionalProposalSchema);

// ── CouncilVote ───────────────────────────────────────────────────────────────
const CouncilVoteSchema = new Schema(
  {
    proposalKey: { type: String, required: true, index: true },
    proposalId:  { type: String, required: true, index: true },  // ConstitutionalProposal._id

    role: {
      type: String, required: true, index: true,
      enum: COUNCIL_ROLES,
    },

    vote: {
      type: String, required: true, index: true,
      enum: COUNCIL_VOTES,
    },

    confidence: { type: Number, default: 0.5 },   // 0..1

    reasoning: { type: String, default: '' },       // operator-safe justification sentence
  },
  { timestamps: true }
);

CouncilVoteSchema.index({ proposalKey: 1, role: 1 }, { unique: true });
CouncilVoteSchema.index({ proposalKey: 1, vote: 1 });

const CouncilVote: Model<any> =
  mongoose.models.CouncilVote ||
  mongoose.model('CouncilVote', CouncilVoteSchema);

// ── ConstitutionalSimulationResult ────────────────────────────────────────────
const ConstitutionalSimulationResultSchema = new Schema(
  {
    proposalKey:     { type: String, required: true, unique: true, index: true },
    proposalId:      { type: String, required: true, index: true },
    simulationRunId: { type: String, default: null, index: true },  // links to NovaSimulationRun

    simulationRuns: { type: Number, default: 0 },

    metrics: {
      successRate:     { type: Number, default: 0 },   // 0..1
      regretDelta:     { type: Number, default: 0 },   // negative = improvement
      riskIncrease:    { type: Number, default: 0 },   // positive = riskier
      performanceGain: { type: Number, default: 0 },   // positive = better
      violationsDelta: { type: Number, default: 0 },   // positive = more violations
    },

    failureCases: { type: [String], default: [] },  // brief descriptions of failure modes

    recommendation: {
      type: String, required: true, index: true,
      enum: COUNCIL_VERDICT,
    },

    simulatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

ConstitutionalSimulationResultSchema.index({ proposalKey: 1, recommendation: 1 });

const ConstitutionalSimulationResult: Model<any> =
  mongoose.models.ConstitutionalSimulationResult ||
  mongoose.model('ConstitutionalSimulationResult', ConstitutionalSimulationResultSchema);

// ── ConstitutionalChangeLog ───────────────────────────────────────────────────
// Insert-only — immutable record of every applied constitutional change.
// Never update this collection.
const ConstitutionalChangeLogSchema = new Schema(
  {
    proposalKey:  { type: String, required: true, index: true },
    proposalId:   { type: String, required: true, index: true },
    targetKey:    { type: String, required: true, index: true },  // ProtectedSystemTarget.targetKey
    targetArea:   { type: String, required: true, index: true },

    changeType: {
      type: String, required: true,
      enum: PROPOSAL_TYPES,
    },

    oldValue: { type: Schema.Types.Mixed, default: null },  // value before change
    newValue: { type: Schema.Types.Mixed, default: null },  // value after change

    rolloutType: {
      type: String, required: true, index: true,
      enum: ROLLOUT_TYPES,
    },

    appliedAt: { type: Date, default: Date.now },

    // Outcome fields (updated after observation window, but only via $set on outcome sub-doc)
    outcome: {
      observed:              { type: Boolean,  default: false },
      success:               { type: Boolean,  default: null  },
      regretScore:           { type: Number,   default: null  },
      violationsTriggered:   { type: Number,   default: 0    },
      promotedToGlobal:      { type: Boolean,  default: false },
      rolledBack:            { type: Boolean,  default: false },
      observedAt:            { type: Date,     default: null  },
    },
  },
  { timestamps: true }
);

ConstitutionalChangeLogSchema.index({ targetKey: 1, createdAt: -1 });
ConstitutionalChangeLogSchema.index({ rolloutType: 1, 'outcome.observed': 1 });
// Note: outcome may be updated once — never delete or re-insert

const ConstitutionalChangeLog: Model<any> =
  mongoose.models.ConstitutionalChangeLog ||
  mongoose.model('ConstitutionalChangeLog', ConstitutionalChangeLogSchema);

export {
  ConstitutionalProposal,
  CouncilVote,
  ConstitutionalSimulationResult,
  ConstitutionalChangeLog,
};

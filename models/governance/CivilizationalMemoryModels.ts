/**
 * models/governance/CivilizationalMemoryModels.ts
 *
 * Five exports — one file.
 *
 * ConstitutionalEra           — a distinct period in governance history. Groups events
 *                               into meaningful epochs with posture/metrics/definingIncidents.
 *
 * ConstitutionalDoctrineArchive — long-horizon record of governance doctrines across eras.
 *                               Tracks durability (eraCount, cohortBreadth, rollbackResistance),
 *                               not just current performance. Different from StrategicDoctrineRule
 *                               which is active/live — this is the historical archive.
 *
 * CivilizationalLesson        — distilled long-horizon truth from repeated cross-era patterns.
 *                               Different from StrategicDoctrineCandidate (proposed today) —
 *                               a Lesson has survived multiple governance cycles and carries
 *                               a confidence score that accounts for contradictions and era breadth.
 *
 * FoundationalIncidentArchive — historically important governance events: failures, crises,
 *                               successful recoveries that shaped law. Referenced by lessons
 *                               and doctrines. Never updated — append-only for archive integrity.
 *
 * MemoryRetrievalRecord       — traceability artifact for when civilizational memory influenced
 *                               a current proposal, audit, or routing decision.
 *
 * ── Non-duplication mapping ──────────────────────────────────────────────────
 *   StrategicDoctrineRule      → active TODAY, tracks live performance
 *   ConstitutionalDoctrineArchive → historical record, tracks multi-era survival
 *
 *   StrategicDoctrineCandidate → proposed based on recent evidence
 *   CivilizationalLesson       → distilled from repeated cross-era patterns,
 *                                confidence-decayed for contradictions + era breadth
 *
 *   GovernanceObservation      → raw per-decision signals
 *   FoundationalIncidentArchive → high-impact historical events (curated, not per-decision)
 *
 *   SelfEvolutionConstitutionEvent → per-evaluation audit trail (current)
 *   MemoryRetrievalRecord          → traceability for when history influenced present
 */

import mongoose, { Schema, Model } from 'mongoose';

const GOVERNANCE_STRICTNESS  = ['strict', 'moderate', 'permissive'] as const;
const AUTONOMY_POSTURES      = ['observe_only', 'shadow_only', 'limited_execute', 'full_execute'] as const;
const FEDERATION_STRENGTHS   = ['isolated', 'advisory', 'collaborative', 'dominant'] as const;
const SIMULATION_RELIANCES   = ['low', 'medium', 'high', 'dominant'] as const;
const MUTATION_RATES         = ['low', 'medium', 'high', 'aggressive'] as const;
const ARCHIVE_DOCTRINE_TYPES = ['safety_doctrine', 'autonomy_doctrine', 'federation_doctrine', 'simulation_doctrine', 'rollback_doctrine', 'mutation_doctrine', 'sovereignty_doctrine'] as const;
const DOCTRINE_STATUS        = ['candidate', 'durable', 'deprecated', 'archived_warning'] as const;
const LESSON_TYPES           = ['warning', 'durable_principle', 'conditional_principle', 'anti_pattern', 'recovery_truth'] as const;
const RECOMMENDED_USES       = ['advisory', 'strong_prior', 'constitutional_candidate', 'immutable_candidate'] as const;
const INCIDENT_TYPES         = ['governance_failure', 'negative_transfer_crisis', 'rollback_success', 'doctrine_collapse', 'simulation_miss', 'mutation_instability', 'autonomy_breach'] as const;
const RETRIEVAL_TYPES        = ['lesson', 'doctrine', 'era', 'incident'] as const;
const APPLIED_AS             = ['advisory', 'downgrade', 'shadow_requirement', 'block', 'proposal_support'] as const;

// ── ConstitutionalEra ─────────────────────────────────────────────────────────
const ConstitutionalEraSchema = new Schema(
  {
    eraKey:       { type: String, required: true, unique: true, index: true },
    label:        { type: String, required: true },
    description:  { type: String, default: '' },

    startAt:      { type: Date, required: true, index: true },
    endAt:        { type: Date, default: null },  // null = current era

    characteristics: {
      governanceStrictness: { type: String, enum: GOVERNANCE_STRICTNESS, default: 'moderate' },
      autonomyPosture:      { type: String, enum: AUTONOMY_POSTURES,     default: 'shadow_only' },
      federationStrength:   { type: String, enum: FEDERATION_STRENGTHS,  default: 'advisory' },
      simulationReliance:   { type: String, enum: SIMULATION_RELIANCES,  default: 'medium' },
      mutationRate:         { type: String, enum: MUTATION_RATES,         default: 'low' },
    },

    // Aggregate metrics across the era's governed decisions
    summaryMetrics: {
      avgViolationRate:       { type: Number, default: 0 },  // 0..1
      avgRegretScore:         { type: Number, default: 0 },  // 0..1
      avgAuditScore:          { type: Number, default: 1 },  // 0..1
      rollbackRate:           { type: Number, default: 0 },  // 0..1
      doctrineStabilityScore: { type: Number, default: 1 },  // 0..1
    },

    definingIncidentKeys: { type: [String], default: [] },  // FoundationalIncidentArchive.incidentKey
    doctrineArchiveKeys:  { type: [String], default: [] },  // ConstitutionalDoctrineArchive.doctrineKey
    lessonKeys:           { type: [String], default: [] },  // CivilizationalLesson.lessonKey

    isCurrent: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

ConstitutionalEraSchema.index({ startAt: 1, endAt: 1 });
ConstitutionalEraSchema.index({ 'characteristics.governanceStrictness': 1, 'characteristics.autonomyPosture': 1 });

const ConstitutionalEra: Model<any> =
  mongoose.models.ConstitutionalEra ||
  mongoose.model('ConstitutionalEra', ConstitutionalEraSchema);

// ── ConstitutionalDoctrineArchive ─────────────────────────────────────────────
// Historical archive of governance doctrines — what survived, what collapsed.
// NOT a live/active doctrine (that is StrategicDoctrineRule).
// Tracks durability across eras and cohorts, not current performance.
const ConstitutionalDoctrineArchiveSchema = new Schema(
  {
    doctrineKey:  { type: String, required: true, unique: true, index: true },
    label:        { type: String, required: true },
    description:  { type: String, default: '' },

    doctrineType: {
      type: String, required: true, index: true,
      enum: ARCHIVE_DOCTRINE_TYPES,
    },

    // What conditions trigger this doctrine and what response it prescribes
    pattern: {
      triggerConditions:  { type: Schema.Types.Mixed, default: {} },
      governanceResponse: { type: Schema.Types.Mixed, default: {} },
      exclusions:         { type: Schema.Types.Mixed, default: {} },  // when NOT to apply
    },

    // Long-horizon durability — cross-era survival, not just recent performance
    durability: {
      survivalScore:      { type: Number, default: 0 },  // 0..1 — computed by scoreDoctrineDurability
      eraCount:           { type: Number, default: 0 },  // how many eras survived
      cohortBreadth:      { type: Number, default: 0 },  // 0..1 — fraction of cohorts still applying it
      rollbackResistance: { type: Number, default: 0 },  // 0..1 — fraction of periods not rolled back
    },

    evidence: {
      successRate:              { type: Number, default: 0 },
      harmRate:                 { type: Number, default: 0 },
      avgRegretDelta:           { type: Number, default: 0 },
      supportingIncidentCount:  { type: Number, default: 0 },
    },

    status: {
      type: String, required: true, default: 'candidate', index: true,
      enum: DOCTRINE_STATUS,
    },

    linkedEraKeys:      { type: [String], default: [] },  // ConstitutionalEra.eraKey
    linkedIncidentKeys: { type: [String], default: [] },  // FoundationalIncidentArchive.incidentKey

    // If deprecated or archived_warning — why
    deprecationReason: { type: String, default: '' },
    deprecatedAt:      { type: Date, default: null },
  },
  { timestamps: true }
);

ConstitutionalDoctrineArchiveSchema.index({ status: 1, 'durability.survivalScore': -1 });
ConstitutionalDoctrineArchiveSchema.index({ doctrineType: 1, status: 1 });

const ConstitutionalDoctrineArchive: Model<any> =
  mongoose.models.ConstitutionalDoctrineArchive ||
  mongoose.model('ConstitutionalDoctrineArchive', ConstitutionalDoctrineArchiveSchema);

// ── CivilizationalLesson ──────────────────────────────────────────────────────
// Distilled long-horizon truth from repeated cross-era governance patterns.
// Confidence accounts for contradictions, era breadth, and recency decay.
// Different from StrategicDoctrineCandidate (proposed today from recent evidence).
const CivilizationalLessonSchema = new Schema(
  {
    lessonKey:  { type: String, required: true, unique: true, index: true },
    title:      { type: String, required: true },
    statement:  { type: String, required: true },  // one clear sentence a system can act on

    lessonType: {
      type: String, required: true, index: true,
      enum: LESSON_TYPES,
    },

    // Applicability scope — when this lesson applies
    scope: {
      domains:     { type: [String], default: [] },    // empty = all domains
      cohortKeys:  { type: [String], default: [] },    // empty = all cohorts
      systemTypes: { type: [String], default: [] },    // empty = all system types
      erasApplied: { type: [String], default: [] },    // eraKeys where this was valid
      eraExclusions:{ type: [String], default: [] },   // eraKeys where it did NOT hold
    },

    evidence: {
      occurrenceCount:     { type: Number, default: 0 },   // times this pattern appeared
      supportingEraCount:  { type: Number, default: 0 },   // cross-era validation
      contradictionCount:  { type: Number, default: 0 },   // times contradicted
      confidenceScore:     { type: Number, default: 0 },   // 0..1 — decays with contradictions
      lastReinforcedAt:    { type: Date,   default: null }, // for recency decay calculation
    },

    recommendedUse: {
      type: String, required: true, default: 'advisory',
      enum: RECOMMENDED_USES,
    },

    linkedDoctrineKeys:  { type: [String], default: [] },  // ConstitutionalDoctrineArchive.doctrineKey
    linkedIncidentKeys:  { type: [String], default: [] },  // FoundationalIncidentArchive.incidentKey

    // Confidence decay — old lessons become advisory if unreinforced
    confidenceDecayEnabled: { type: Boolean, default: true },
    decayHalfLifeDays:      { type: Number,  default: 180 }, // days until confidence halves if unreinforced
  },
  { timestamps: true }
);

CivilizationalLessonSchema.index({ lessonType: 1, 'evidence.confidenceScore': -1 });
CivilizationalLessonSchema.index({ recommendedUse: 1, lessonType: 1 });
CivilizationalLessonSchema.index({ 'scope.cohortKeys': 1, lessonType: 1 });

const CivilizationalLesson: Model<any> =
  mongoose.models.CivilizationalLesson ||
  mongoose.model('CivilizationalLesson', CivilizationalLessonSchema);

// ── FoundationalIncidentArchive ───────────────────────────────────────────────
// High-impact governance events preserved as historical reference.
// Insert-only — never update, never delete. Archive integrity is paramount.
// Referenced by CivilizationalLesson and ConstitutionalDoctrineArchive.
const FoundationalIncidentArchiveSchema = new Schema(
  {
    incidentKey:  { type: String, required: true, unique: true, index: true },
    title:        { type: String, required: true },
    description:  { type: String, required: true },  // 2-4 sentences, operator-safe

    incidentType: {
      type: String, required: true, index: true,
      enum: INCIDENT_TYPES,
    },

    severity:   { type: String, default: 'medium', index: true },  // low | medium | high | critical
    domains:    { type: [String], default: [] },
    cohortKeys: { type: [String], default: [] },
    eraKey:     { type: String, default: null, index: true },  // ConstitutionalEra.eraKey

    impact: {
      regretLift:           { type: Number, default: 0 },  // avg regret increase caused
      violationLift:        { type: Number, default: 0 },  // violation rate increase
      rollbackCascadeCount: { type: Number, default: 0 },  // systems that rolled back
      doctrineLossCount:    { type: Number, default: 0 },  // doctrines invalidated
    },

    lessonsExtracted: { type: [String], default: [] },  // CivilizationalLesson.lessonKey

    occurredAt: { type: Date, required: true },  // when the incident happened (not createdAt)
  },
  { timestamps: true }
);

FoundationalIncidentArchiveSchema.index({ incidentType: 1, severity: 1, occurredAt: -1 });
FoundationalIncidentArchiveSchema.index({ eraKey: 1, incidentType: 1 });
// No update indexes — this collection is insert-only

const FoundationalIncidentArchive: Model<any> =
  mongoose.models.FoundationalIncidentArchive ||
  mongoose.model('FoundationalIncidentArchive', FoundationalIncidentArchiveSchema);

// ── MemoryRetrievalRecord ─────────────────────────────────────────────────────
// Traceability artifact — records when civilizational memory influenced a decision.
// Enables the "Historical Influence Log" dashboard panel and audit trail.
const MemoryRetrievalRecordSchema = new Schema(
  {
    retrievalKey:  { type: String, required: true, unique: true, index: true },
    decisionId:    { type: String, default: null, index: true },  // GovernedDecisionRecord._id
    proposalKey:   { type: String, default: null, index: true },  // ConstitutionalProposal.proposalKey
    auditEventKey: { type: String, default: null, index: true },  // SelfEvolutionConstitutionEvent.eventKey

    retrievalType: {
      type: String, required: true, index: true,
      enum: RETRIEVAL_TYPES,
    },

    retrievedKeys: { type: [String], default: [] },    // keys of the records retrieved
    influenceStrength: { type: Number, default: 0 },   // 0..1 — how strongly memory affected outcome

    appliedAs: {
      type: String, required: true,
      enum: APPLIED_AS,
    },

    rationale: { type: String, default: '' },   // operator-safe sentence explaining influence
  },
  { timestamps: true }
);

MemoryRetrievalRecordSchema.index({ retrievalType: 1, appliedAs: 1, createdAt: -1 });
MemoryRetrievalRecordSchema.index({ proposalKey: 1, retrievalType: 1 });

const MemoryRetrievalRecord: Model<any> =
  mongoose.models.MemoryRetrievalRecord ||
  mongoose.model('MemoryRetrievalRecord', MemoryRetrievalRecordSchema);

export {
  ConstitutionalEra,
  ConstitutionalDoctrineArchive,
  CivilizationalLesson,
  FoundationalIncidentArchive,
  MemoryRetrievalRecord,
};

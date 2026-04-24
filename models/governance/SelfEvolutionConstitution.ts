/**
 * models/governance/SelfEvolutionConstitution.ts
 *
 * Three exports — one file.
 *
 * SelfEvolutionConstitutionRule  : the law — defines protection tier and allowed change classes
 * ProtectedSystemTarget          : the registry — what exists and how protected it is
 * SelfEvolutionConstitutionEvent : the audit log — every constitutional evaluation persisted
 *
 * 4 Protection Tiers:
 *   autonomous         : Nova may tune within bounds, no approval required
 *   approval_required  : Nova may propose + shadow-test, human must approve rollout
 *   high_governance    : elevated approval + shadow evidence required
 *   immutable          : Nova may NOT modify via self-evolution. Ever.
 *
 * CENTRAL RULE:
 *   Nova may evolve its strategy.
 *   Nova may NOT evolve its constitutional protections autonomously.
 *   Without this boundary, self-evolution eventually becomes self-exemption.
 */
import mongoose, { Schema, Model } from 'mongoose';

const TIERS    = ['autonomous', 'approval_required', 'high_governance', 'immutable'] as const;
const VERDICTS = ['allow', 'allow_shadow', 'approval_required', 'constitutional_approval_required', 'block'] as const;
const TARGET_TYPES = ['weight', 'threshold', 'doctrine', 'governance_rule', 'autopilot_rule', 'audit_rule', 'authority_rule', 'emergency_rule', 'constitutional_precedence'] as const;

// ── Constitution Rule (the law) ────────────────────────────────────────────
const SelfEvolutionConstitutionRuleSchema = new Schema({
  ruleKey:    { type: String, required: true, unique: true, index: true },
  targetArea: { type: String, required: true, index: true },   // matches ProtectedSystemTarget.targetArea

  protectionTier:              { type: String, required: true, enum: TIERS, index: true },
  allowedProposalTypes:        { type: [String], default: [] },
  maxAllowedChangeMagnitude:   { type: Number, default: 0 },

  requiresShadowEvidence:      { type: Boolean, default: true },
  requiresHumanApproval:       { type: Boolean, default: false },
  requiresConstitutionalApproval:{ type: Boolean, default: false },

  immutableReason:             { type: String, default: '' },  // shown in UI for immutable targets
  enabled:                     { type: Boolean, default: true, index: true },
}, { timestamps: true });

const SelfEvolutionConstitutionRule: Model<any> =
  mongoose.models.SelfEvolutionConstitutionRule ||
  mongoose.model('SelfEvolutionConstitutionRule', SelfEvolutionConstitutionRuleSchema);

// ── Protected Target Registry ──────────────────────────────────────────────
const ProtectedSystemTargetSchema = new Schema({
  targetKey:   { type: String, required: true, unique: true, index: true },
  targetArea:  { type: String, required: true, index: true },  // used to resolve constitutional rule
  targetType:  { type: String, required: true, enum: TARGET_TYPES, index: true },

  protectionTier:    { type: String, required: true, enum: TIERS, index: true },
  constitutionLocked:{ type: Boolean, default: false, index: true },  // immutable targets always true

  currentValue: { type: Schema.Types.Mixed, default: {} },
  allowedRange: { type: Schema.Types.Mixed, default: {} },  // { min, max } for numeric targets

  description: { type: String, default: '' },   // human-readable explanation
}, { timestamps: true });

ProtectedSystemTargetSchema.index({ protectionTier: 1, targetType: 1 });
ProtectedSystemTargetSchema.index({ targetArea: 1, constitutionLocked: 1 });

const ProtectedSystemTarget: Model<any> =
  mongoose.models.ProtectedSystemTarget ||
  mongoose.model('ProtectedSystemTarget', ProtectedSystemTargetSchema);

// ── Constitutional Audit Event ─────────────────────────────────────────────
const SelfEvolutionConstitutionEventSchema = new Schema({
  eventKey:    { type: String, required: true, unique: true, index: true },
  proposalKey: { type: String, required: true, index: true },
  targetKey:   { type: String, required: true, index: true },

  constitutionalVerdict: { type: String, required: true, enum: VERDICTS, index: true },
  evaluatedTier:         { type: String, required: true, enum: TIERS },
  reason:                { type: String, default: '' },

  requestedChangeMagnitude: { type: Number, default: 0 },
  allowedChangeMagnitude:   { type: Number, default: 0 },

  immutableGuardTriggered:  { type: Boolean, default: false },  // true if hard stop fired
  proposalType:             { type: String, default: '' },
  hasShadowEvidence:        { type: Boolean, default: false },
}, { timestamps: true });

SelfEvolutionConstitutionEventSchema.index({ constitutionalVerdict: 1, createdAt: -1 });
SelfEvolutionConstitutionEventSchema.index({ targetKey: 1, constitutionalVerdict: 1 });

const SelfEvolutionConstitutionEvent: Model<any> =
  mongoose.models.SelfEvolutionConstitutionEvent ||
  mongoose.model('SelfEvolutionConstitutionEvent', SelfEvolutionConstitutionEventSchema);

export { SelfEvolutionConstitutionRule, ProtectedSystemTarget, SelfEvolutionConstitutionEvent };

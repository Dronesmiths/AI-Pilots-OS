/**
 * models/governance/ConstitutionalExecutionAudit.ts  (v2 — proper sub-schemas)
 *
 * Two exports — one file.
 *   ConstitutionalExecutionAudit     : main audit event (truth spine)
 *   ConstitutionalExecutionAggregate : window rollups for panel speed
 *
 * CHANGES from v1:
 *   - Actor / Target / Proposal / etc. are now proper sub-schemas with _id: false
 *   - Field-level indexes on sub-document fields are now correctly declared
 *   - InferSchemaType export for TS type generation
 *   - Removed top-level Schema.Types.Mixed fields — now typed sub-docs
 */
import mongoose, { InferSchemaType, Schema, Model } from 'mongoose';

// ── Sub-schemas ───────────────────────────────────────────────────────────
const ActorSchema = new Schema({
  actorType:   { type: String, enum: ['nova', 'operator', 'system', 'federated_policy', 'simulation'], required: true },
  actorId:     { type: String },
  displayName: { type: String },
  source:      { type: String, index: true },
}, { _id: false });

const TargetSchema = new Schema({
  targetKey:          { type: String, required: true, index: true },
  targetPath:         { type: String, required: true },
  targetCategory:     { type: String, index: true },
  protectionTier:     { type: String, enum: ['autonomous', 'approval_required', 'high_governance', 'immutable'], required: true, index: true },
  constitutionLocked: { type: Boolean, default: false, index: true },
}, { _id: false });

const ProposalSchema = new Schema({
  actionType:    { type: String, enum: ['create', 'update', 'delete', 'reweight', 'promote', 'demote', 'toggle', 'registry_change'], required: true },
  reason:        { type: String },
  trigger:       { type: String, index: true },
  beforeValue:   { type: Schema.Types.Mixed },
  proposedValue: { type: Schema.Types.Mixed },
  deltaSummary:  { type: String },
}, { _id: false });

const ConstitutionalEvaluationSchema = new Schema({
  verdict:            { type: String, enum: ['allow', 'approval_required', 'high_governance', 'block'], required: true, index: true },
  ruleCode:           { type: String, index: true },
  rationale:          { type: String, required: true },
  matchedConstraints: [{ type: String }],
  evaluatorVersion:   { type: String },
}, { _id: false });

const EnforcementSchema = new Schema({
  evaluatedAt:        { type: Date },
  executionAttempted: { type: Boolean, default: false },
  executionStartedAt: { type: Date },
  executionFinishedAt:{ type: Date },
  enforcementPlane:   { type: String, enum: ['evaluation', 'route_guard', 'persistence_guard', 'execution_runtime', 'none'], default: 'none', index: true },
  preventedMutation:  { type: Boolean, default: false },
  throwCode:          { type: String },
  throwMessage:       { type: String },
}, { _id: false });

const OutcomeSchema = new Schema({
  status:         { type: String, enum: ['blocked', 'escalated', 'allowed_not_executed', 'executed', 'execution_failed'], required: true, index: true },
  stateChanged:   { type: Boolean, default: false },
  afterValue:     { type: Schema.Types.Mixed },
  mutationCount:  { type: Number, default: 0 },
  approvalCaseId: { type: String, index: true },
}, { _id: false });

const GovernanceContextSchema = new Schema({
  activeMode:       { type: String, index: true },
  strategyCycleId:  { type: String, index: true },
  doctrineVersion:  { type: String },
  boardSessionId:   { type: String, index: true },
  federatedPriorId: { type: String, index: true },
}, { _id: false });

// ── Main audit record ─────────────────────────────────────────────────────
const ConstitutionalExecutionAuditSchema = new Schema({
  tenantId:      { type: String, required: true, index: true },
  auditId:       { type: String, required: true, unique: true, index: true },
  correlationId: { type: String, index: true },
  requestId:     { type: String, index: true },
  simulationId:  { type: String, index: true },

  actor:                   { type: ActorSchema,                   required: true },
  target:                  { type: TargetSchema,                  required: true },
  proposal:                { type: ProposalSchema,                required: true },
  constitutionalEvaluation:{ type: ConstitutionalEvaluationSchema,required: true },
  enforcement:             { type: EnforcementSchema,             default: {} },
  outcome:                 { type: OutcomeSchema,                 required: true },
  governanceContext:        { type: GovernanceContextSchema,       default: {} },

  tags:      [{ type: String, index: true }],
  occurredAt:{ type: Date, required: true, index: true },
}, { timestamps: true });

// Compound indexes for common query patterns
ConstitutionalExecutionAuditSchema.index({ tenantId: 1, occurredAt: -1 });
ConstitutionalExecutionAuditSchema.index({ tenantId: 1, 'outcome.status': 1, occurredAt: -1 });
ConstitutionalExecutionAuditSchema.index({ tenantId: 1, 'target.targetKey': 1, occurredAt: -1 });
ConstitutionalExecutionAuditSchema.index({ 'actor.actorType': 1, 'constitutionalEvaluation.verdict': 1 });

export type ConstitutionalExecutionAuditDocument = InferSchemaType<typeof ConstitutionalExecutionAuditSchema>;

const ConstitutionalExecutionAudit: Model<any> =
  mongoose.models.ConstitutionalExecutionAudit ||
  mongoose.model('ConstitutionalExecutionAudit', ConstitutionalExecutionAuditSchema);

// ── Aggregate rollups ─────────────────────────────────────────────────────
const ConstitutionalExecutionAggregateSchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  window:   { type: String, required: true, enum: ['24h', '7d', '30d', 'lifetime'] },
  totals: {
    evaluated: { type: Number, default: 0 },
    blocked:   { type: Number, default: 0 },
    escalated: { type: Number, default: 0 },
    executed:  { type: Number, default: 0 },
    failed:    { type: Number, default: 0 },
  },
  tierBreakdown: {
    autonomous:        { type: Number, default: 0 },
    approval_required: { type: Number, default: 0 },
    high_governance:   { type: Number, default: 0 },
    immutable:         { type: Number, default: 0 },
  },
  immutableAttempts: { type: Number, default: 0 },
  executionFailures: { type: Number, default: 0 },
  topTargets: [{ targetKey: String, count: Number, blockedCount: Number }],
  lastUpdatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

ConstitutionalExecutionAggregateSchema.index({ tenantId: 1, window: 1 }, { unique: true });

const ConstitutionalExecutionAggregate: Model<any> =
  mongoose.models.ConstitutionalExecutionAggregate ||
  mongoose.model('ConstitutionalExecutionAggregate', ConstitutionalExecutionAggregateSchema);

export { ConstitutionalExecutionAudit, ConstitutionalExecutionAggregate };
export default ConstitutionalExecutionAudit;

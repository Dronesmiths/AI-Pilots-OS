/**
 * models/onboarding/OnboardingSession.ts
 *
 * Master state object for a client installation.
 * Tracks the entire setup lifecycle from draft → installed.
 *
 * status values (ordered):
 *   draft         → session created, collecting info
 *   collecting    → wizard in progress
 *   ready         → readiness check passed, install available
 *   installing    → install job running
 *   installed     → verified and complete
 *   failed        → install failed, see lastError
 *   needs_attention → post-install verification failed
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const OnboardingSessionSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  business: {
    name:         { type: String, required: true },
    domain:       { type: String, default: '' },
    niche:        { type: String, default: '' },
    city:         { type: String, default: '' },
    state:        { type: String, default: '' },
    contactName:  { type: String, default: '' },
    contactEmail: { type: String, default: '' },
  },

  connections: {
    domainConnected:       { type: Boolean, default: false },
    domainVerified:        { type: Boolean, default: false },
    gscConnected:          { type: Boolean, default: false },
    gscPropertyVerified:   { type: Boolean, default: false },
    githubConnected:       { type: Boolean, default: false },
    deployTargetReady:     { type: Boolean, default: false },
  },

  install: {
    status:            { type: String, default: 'draft' },
    installStartedAt:  { type: Date },
    installCompletedAt: { type: Date },
    lastError:         { type: String, default: '' },
    installJobId:      { type: String, default: '' },
    // Lock prevents concurrent installs
    locked:            { type: Boolean, default: false },
    lockedAt:          { type: Date },
  },

  engineConfig: {
    siteType:            { type: String, default: 'local_business' },
    publishMode:         { type: String, default: 'assisted' },
    autopilotEnabled:    { type: Boolean, default: false },
    targetGeo:           { type: String, default: '' },
    defaultServicePages: [{ type: String }],
    defaultBlogTopics:   [{ type: String }],
    starterConfig:       { type: Schema.Types.Mixed, default: null },
  },

  readiness: {
    score:          { type: Number, default: 0 },
    blockers:       [{ type: String }],
    warnings:       [{ type: String }],
    ready:          { type: Boolean, default: false },
    lastEvaluatedAt: { type: Date },
  },

  postInstall: {
    siteUrl:          { type: String, default: '' },
    dashboardUrl:     { type: String, default: '' },
    deployUrl:        { type: String, default: '' },
    verificationOk:   { type: Boolean, default: false },
    firstRunComplete: { type: Boolean, default: false },
  },
}, { timestamps: true });

OnboardingSessionSchema.index({ tenantId: 1, clientId: 1 }, { unique: true });
OnboardingSessionSchema.index({ 'install.status': 1, updatedAt: -1 });

export type OnboardingSessionDocument = InferSchemaType<typeof OnboardingSessionSchema>;
export default mongoose.models.OnboardingSession ||
  mongoose.model('OnboardingSession', OnboardingSessionSchema);

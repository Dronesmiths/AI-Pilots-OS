/**
 * models/onboarding/InstallJob.ts
 *
 * Durable install execution record.
 * Created when install starts, updated at each step.
 * Survives server restarts — status polling reads from this.
 *
 * status values:
 *   queued      → created, waiting to start
 *   running     → orchestrator active
 *   completed   → install verified and clean
 *   failed      → fatal error at a step
 *   rolled_back → partial install cleaned up
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const INSTALL_STEPS = [
  'validate_readiness',
  'normalize_domain',
  'confirm_gsc',
  'confirm_github',
  'build_starter_config',
  'seed_mongo_state',
  'push_github_assets',
  'trigger_deploy',
  'poll_deploy_status',
  'verify_live_install',
  'trigger_first_run',
  'mark_complete',
] as const;

const InstallJobSchema = new Schema({
  tenantId:            { type: String, index: true, required: true },
  clientId:            { type: String, index: true, required: true },
  onboardingSessionId: { type: String, index: true, required: true },

  status:      { type: String, default: 'queued' },
  initiatedBy: { type: String, required: true },

  progress: {
    currentStep:    { type: String, default: '' },
    completedSteps: [{ type: String }],
    failedStep:     { type: String, default: '' },
    percent:        { type: Number, default: 0 },
    startedAt:      { type: Date },
    completedAt:    { type: Date },
  },

  result: {
    deployUrl:    { type: String, default: '' },
    dashboardUrl: { type: String, default: '' },
    siteUrl:      { type: String, default: '' },
    pagesCreated: { type: Number, default: 0 },
    warnings:     [{ type: String }],
  },

  error: {
    failedStep: { type: String, default: '' },
    message:    { type: String, default: '' },
    stack:      { type: String, default: '' },
    humanNote:  { type: String, default: '' }, // plain-English explanation for admin UI
  },

  idempotencyKey: { type: String, index: true, default: '' }, // clientId + date to prevent double-runs
}, { timestamps: true });

InstallJobSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });
InstallJobSchema.index({ idempotencyKey: 1 }, { sparse: true });

export const INSTALL_STEP_LABELS: Record<string, string> = {
  validate_readiness:  'Checking setup requirements',
  normalize_domain:    'Validating domain',
  confirm_gsc:         'Connecting Search Console',
  confirm_github:      'Verifying repository access',
  build_starter_config: 'Building site configuration',
  seed_mongo_state:    'Creating site profile',
  push_github_assets:  'Deploying SEO engine files',
  trigger_deploy:      'Triggering site deployment',
  poll_deploy_status:  'Waiting for deployment',
  verify_live_install: 'Verifying live installation',
  trigger_first_run:   'Activating growth engine',
  mark_complete:       'Finalizing setup',
};

export const INSTALL_STEP_PERCENT: Record<string, number> = {
  validate_readiness:   5,
  normalize_domain:    10,
  confirm_gsc:         18,
  confirm_github:      25,
  build_starter_config: 35,
  seed_mongo_state:    45,
  push_github_assets:  60,
  trigger_deploy:      70,
  poll_deploy_status:  80,
  verify_live_install: 90,
  trigger_first_run:   96,
  mark_complete:      100,
};

export type InstallJobDocument = InferSchemaType<typeof InstallJobSchema>;
export default mongoose.models.InstallJob ||
  mongoose.model('InstallJob', InstallJobSchema);

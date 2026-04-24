/**
 * lib/onboarding/types.ts
 *
 * Shared types for the tenant activation pipeline.
 * Single source of truth — imported by route, orchestrator, and all steps.
 */

export type ActivateTenantInput = {
  domain:      string;
  repoUrl:     string;
  gscSiteUrl?: string;
  name?:       string;
};

export type ActivateTenantResult = {
  tenantId: string;
  status:   'activated' | 'partial';
  steps: {
    tenant:          'created'      | 'failed';
    dashboard:       'initialized'  | 'failed';
    engine:          'provisioned'  | 'failed';
    queue:           'seeded'       | 'failed';
    activationEvent: 'emitted'      | 'failed';
  };
  message?: string;
};

// ── Preflight types ────────────────────────────────────────────────────────

export type PreflightInput = {
  domain:     string;
  repoUrl:    string;
  gscSiteUrl?: string;
  tenantId?:  string; // optional — used to namespace the logging test write
};

export type PreflightCheckResult = {
  ok:       boolean;
  message?: string;
  meta?:    Record<string, unknown>;
};

export type PreflightResult = {
  ok: boolean;
  checks: {
    domain:  PreflightCheckResult;
    repo:    PreflightCheckResult;
    gsc:     PreflightCheckResult;
    logging: PreflightCheckResult;
  };
  durationMs: number;
};

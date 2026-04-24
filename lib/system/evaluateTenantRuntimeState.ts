/**
 * lib/system/evaluateTenantRuntimeState.ts
 *
 * Pure function — no DB calls.
 * Tenant-specific thresholds are lower than global: tenants warm up faster.
 *
 * Thresholds:
 *   cold → warming:   any jobs OR queue depth > 0
 *   warming → warm:   10+ jobs, ≤1 failure, last success <15min
 *   any → degraded:   5+ failures OR idle >30min
 *   degraded → warming: last success <5min AND failures not climbing
 */

export type TenantRuntimeMetrics = {
  jobsProcessedSinceActivation: number;
  failedJobsSinceActivation:    number;
  queueDepth:                   number;
  lastSuccessfulActionAt?:      Date | null;
  pagesPublished:               number;
  internalLinksAdded:           number;
};

export type RuntimeState = 'cold' | 'warming' | 'warm' | 'degraded';

const TENANT_WARM_JOB_THRESHOLD  = parseInt(process.env.TENANT_WARM_JOB_THRESHOLD  ?? '10', 10);
const TENANT_WARM_FAIL_MAX       = parseInt(process.env.TENANT_WARM_FAIL_MAX        ?? '1',  10);
const TENANT_WARM_SUCCESS_WINDOW = parseInt(process.env.TENANT_WARM_SUCCESS_WINDOW  ?? '15', 10); // minutes
const TENANT_DEGRADE_FAIL_SPIKE  = parseInt(process.env.TENANT_DEGRADE_FAIL_SPIKE   ?? '5',  10);
const TENANT_DEGRADE_IDLE_WINDOW = parseInt(process.env.TENANT_DEGRADE_IDLE_WINDOW  ?? '30', 10); // minutes
const TENANT_RECOVER_GATE        = parseInt(process.env.TENANT_RECOVER_GATE         ?? '5',  10); // minutes

export function evaluateTenantRuntimeState(
  metrics:      TenantRuntimeMetrics,
  currentState: RuntimeState = 'cold',
): RuntimeState {
  const now = Date.now();

  const lastSuccessAgeMin = metrics.lastSuccessfulActionAt
    ? (now - new Date(metrics.lastSuccessfulActionAt).getTime()) / 60_000
    : Infinity;

  // ── Degradation (applies from any non-cold state) ───────────────────────────
  if (currentState !== 'cold') {
    const failSpike   = metrics.failedJobsSinceActivation > TENANT_DEGRADE_FAIL_SPIKE;
    const idleTooLong = lastSuccessAgeMin > TENANT_DEGRADE_IDLE_WINDOW;
    if (failSpike || idleTooLong) return 'degraded';
  }

  // ── Degraded recovery path ──────────────────────────────────────────────────
  if (currentState === 'degraded') {
    return lastSuccessAgeMin < TENANT_RECOVER_GATE ? 'warming' : 'degraded';
  }

  // ── Warm ────────────────────────────────────────────────────────────────────
  if (
    metrics.jobsProcessedSinceActivation >= TENANT_WARM_JOB_THRESHOLD &&
    metrics.failedJobsSinceActivation    <= TENANT_WARM_FAIL_MAX &&
    lastSuccessAgeMin                     < TENANT_WARM_SUCCESS_WINDOW
  ) {
    return 'warm';
  }

  // ── Warming ─────────────────────────────────────────────────────────────────
  if (metrics.jobsProcessedSinceActivation > 0 || metrics.queueDepth > 0) {
    return 'warming';
  }

  return 'cold';
}

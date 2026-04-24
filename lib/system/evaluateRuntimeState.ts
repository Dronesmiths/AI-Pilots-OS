/**
 * lib/system/evaluateRuntimeState.ts
 *
 * Pure function — no DB calls, no side effects.
 * Returns the next state based on current metrics.
 *
 * Thresholds (conservative for launch):
 *   cold     → warming:   any worker active OR any job processed
 *   warming  → warm:      25+ jobs, ≤2 failures, last success <10min
 *   warm     → degraded:  last success >20min OR failures >10
 *   degraded → warming:   last success <5min AND failures stopped climbing
 *
 * These are intentionally simple and easy to tune via env vars later.
 */

export type RuntimeState = 'cold' | 'warming' | 'warm' | 'degraded';

export type RuntimeMetrics = {
  jobsProcessedSinceBoot:  number;
  failedJobsSinceBoot:     number;
  queueDepth:              number;
  activeWorkers:           number;
  lastSuccessfulActionAt?: Date | null;
};

const WARM_JOB_THRESHOLD   = parseInt(process.env.WARM_JOB_THRESHOLD   ?? '25',  10);
const WARM_FAIL_MAX        = parseInt(process.env.WARM_FAIL_MAX         ?? '2',   10);
const WARM_SUCCESS_WINDOW  = parseInt(process.env.WARM_SUCCESS_WINDOW   ?? '10',  10); // minutes
const DEGRADE_IDLE_WINDOW  = parseInt(process.env.DEGRADE_IDLE_WINDOW   ?? '20',  10); // minutes
const DEGRADE_FAIL_SPIKE   = parseInt(process.env.DEGRADE_FAIL_SPIKE    ?? '10',  10);
const RECOVER_SUCCESS_GATE = parseInt(process.env.RECOVER_SUCCESS_GATE  ?? '5',   10); // minutes

export function evaluateRuntimeState(
  metrics:      RuntimeMetrics,
  currentState: RuntimeState = 'cold',
): RuntimeState {
  const now = Date.now();

  const lastSuccessAgeMin = metrics.lastSuccessfulActionAt
    ? (now - new Date(metrics.lastSuccessfulActionAt).getTime()) / 60_000
    : Infinity;

  // ── Degradation check (applies from any state except cold) ─────────────────
  if (currentState !== 'cold') {
    const failSpike  = metrics.failedJobsSinceBoot > DEGRADE_FAIL_SPIKE;
    const idleTooLong = lastSuccessAgeMin > DEGRADE_IDLE_WINDOW;
    if (failSpike || idleTooLong) return 'degraded';
  }

  // ── Degraded recovery path ──────────────────────────────────────────────────
  if (currentState === 'degraded') {
    const recentSuccess = lastSuccessAgeMin < RECOVER_SUCCESS_GATE;
    if (recentSuccess) return 'warming'; // re-enter warming, re-prove health
    return 'degraded';
  }

  // ── Warm check ──────────────────────────────────────────────────────────────
  if (
    metrics.jobsProcessedSinceBoot >= WARM_JOB_THRESHOLD &&
    metrics.failedJobsSinceBoot    <= WARM_FAIL_MAX &&
    metrics.activeWorkers           > 0 &&
    lastSuccessAgeMin               < WARM_SUCCESS_WINDOW
  ) {
    return 'warm';
  }

  // ── Warming check ───────────────────────────────────────────────────────────
  if (metrics.jobsProcessedSinceBoot > 0 || metrics.activeWorkers > 0) {
    return 'warming';
  }

  return 'cold';
}

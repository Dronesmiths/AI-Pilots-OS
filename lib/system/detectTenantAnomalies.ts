/**
 * lib/system/detectTenantAnomalies.ts
 *
 * Pure function — given current tenant state + metrics, returns a list of
 * detected anomalies. No DB calls.
 *
 * Called before saveAnomalyActions() in the anomaly engine.
 *
 * Anomaly types:
 *   stuck_cold           — tenant activated but still cold after threshold time
 *   stuck_warming        — warming for too long without reaching warm
 *   repeated_degradation — became degraded more than once in recent history
 *   missing_milestones   — warm but no pages published yet
 *   silent_warm_tenant   — warm but no activity for a long time
 *   recovery_loop        — degraded → warming → degraded cycle repeating
 */

export type AnomalyType =
  | 'stuck_cold'
  | 'stuck_warming'
  | 'repeated_degradation'
  | 'missing_milestones'
  | 'silent_warm_tenant'
  | 'recovery_loop';

export interface TenantAnomaly {
  type:        AnomalyType;
  severity:    'low' | 'medium' | 'high';
  description: string;
  data?:       Record<string, any>;
}

export interface AnomalyInputState {
  state:                        'cold' | 'warming' | 'warm' | 'degraded';
  activatedAt?:                 Date | null;
  warmedAt?:                    Date | null;
  degradedAt?:                  Date | null;
  jobsProcessedSinceActivation: number;
  failedJobsSinceActivation:    number;
  pagesPublished:               number;
  lastSuccessfulActionAt?:      Date | null;
  // Lifecycle event counts for pattern detection
  degradationCount?:            number; // how many times this tenant has been degraded
  recoveryCount?:               number; // how many times recovery has run
}

const STUCK_COLD_THRESHOLD_MIN    = parseInt(process.env.STUCK_COLD_THRESHOLD_MIN    ?? '60',  10);
const STUCK_WARMING_THRESHOLD_MIN = parseInt(process.env.STUCK_WARMING_THRESHOLD_MIN ?? '120', 10);
const SILENT_WARM_THRESHOLD_MIN   = parseInt(process.env.SILENT_WARM_THRESHOLD_MIN   ?? '60',  10);
const REPEATED_DEGRADE_THRESHOLD  = parseInt(process.env.REPEATED_DEGRADE_THRESHOLD  ?? '2',   10);
const RECOVERY_LOOP_THRESHOLD     = parseInt(process.env.RECOVERY_LOOP_THRESHOLD     ?? '3',   10);

export function detectTenantAnomalies(input: AnomalyInputState): TenantAnomaly[] {
  const now      = Date.now();
  const anomalies: TenantAnomaly[] = [];

  const ageMin = (date?: Date | null) =>
    date ? (now - new Date(date).getTime()) / 60_000 : 0;

  const activatedAgeMin      = ageMin(input.activatedAt);
  const lastSuccessAgeMin    = input.lastSuccessfulActionAt ? ageMin(input.lastSuccessfulActionAt) : Infinity;

  // ── stuck_cold ────────────────────────────────────────────────────────────
  if (
    input.state === 'cold' &&
    activatedAgeMin > STUCK_COLD_THRESHOLD_MIN &&
    input.jobsProcessedSinceActivation === 0
  ) {
    anomalies.push({
      type:        'stuck_cold',
      severity:    'high',
      description: `Tenant has been cold for ${Math.floor(activatedAgeMin)}min with 0 jobs processed`,
      data:        { activatedAgeMin: Math.floor(activatedAgeMin) },
    });
  }

  // ── stuck_warming ─────────────────────────────────────────────────────────
  if (
    input.state === 'warming' &&
    activatedAgeMin > STUCK_WARMING_THRESHOLD_MIN &&
    input.jobsProcessedSinceActivation < 10
  ) {
    anomalies.push({
      type:        'stuck_warming',
      severity:    'medium',
      description: `Tenant warming for ${Math.floor(activatedAgeMin)}min with only ${input.jobsProcessedSinceActivation} jobs`,
      data:        { activatedAgeMin: Math.floor(activatedAgeMin), jobsProcessed: input.jobsProcessedSinceActivation },
    });
  }

  // ── repeated_degradation ──────────────────────────────────────────────────
  if ((input.degradationCount ?? 0) >= REPEATED_DEGRADE_THRESHOLD) {
    anomalies.push({
      type:        'repeated_degradation',
      severity:    'high',
      description: `Tenant has degraded ${input.degradationCount} times — systemic instability`,
      data:        { degradationCount: input.degradationCount },
    });
  }

  // ── missing_milestones ────────────────────────────────────────────────────
  if (
    input.state === 'warm' &&
    input.pagesPublished === 0 &&
    input.jobsProcessedSinceActivation > 5
  ) {
    anomalies.push({
      type:        'missing_milestones',
      severity:    'medium',
      description: 'Tenant is warm with jobs processed but no pages published yet',
      data:        { jobsProcessed: input.jobsProcessedSinceActivation },
    });
  }

  // ── silent_warm_tenant ────────────────────────────────────────────────────
  if (
    input.state === 'warm' &&
    lastSuccessAgeMin > SILENT_WARM_THRESHOLD_MIN
  ) {
    anomalies.push({
      type:        'silent_warm_tenant',
      severity:    'low',
      description: `Warm tenant has had no activity for ${Math.floor(lastSuccessAgeMin)}min`,
      data:        { lastSuccessAgeMin: Math.floor(lastSuccessAgeMin) },
    });
  }

  // ── recovery_loop ─────────────────────────────────────────────────────────
  if ((input.recoveryCount ?? 0) >= RECOVERY_LOOP_THRESHOLD && input.state === 'degraded') {
    anomalies.push({
      type:        'recovery_loop',
      severity:    'high',
      description: `Tenant has cycled through recovery ${input.recoveryCount} times — requires manual review`,
      data:        { recoveryCount: input.recoveryCount },
    });
  }

  return anomalies;
}

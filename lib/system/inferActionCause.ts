/**
 * lib/system/inferActionCause.ts
 *
 * Pure function — heuristic causal attribution.
 * Given context + outcome + action type, infers WHY the action
 * worked or failed.
 *
 * This starts deterministic. As more causal memories accumulate,
 * you can replace or augment these rules with data-driven patterns.
 *
 * primaryReason becomes the key used in aggregation:
 *   getCausalMemorySummary() groups by (anomaly, action, primaryReason)
 *   so you can learn: "stuck_cold + seed_jobs + cold_start_bootstrap = strong"
 *
 * Confidence values are intentionally conservative on launch.
 * They move higher as patterns repeat across tenants.
 */

export type PrimaryReason =
  | 'cold_start_bootstrap'
  | 'queue_pressure_relief'
  | 'milestone_creation'
  | 'activity_injection_warm_stall'
  | 'throughput_unblock'
  | 'over_recovery_loop'
  | 'unstable_execution_context'
  | 'stabilization_in_progress'
  | 'anomaly_already_clearing'
  | 'insufficient_signal'
  | 'mixed_context';

export interface CausalAttribution {
  primaryReason:       PrimaryReason;
  contributingSignals: string[];
  confidence:          number;
}

export interface CausalContext {
  runtimeState:     string;
  healthScore:      number;
  queueDepth:       number;
  recoveryCount24h: number;
  recentFailures:   number;
  milestoneCount:   number;
  openAnomalyCount: number;
  lifecyclePattern: string[];
}

export interface CausalOutcome {
  anomalyResolved:    boolean;
  improved:           boolean;
  worsened:           boolean;
  effectivenessScore: number;
}

export function inferActionCause(
  context:    CausalContext,
  outcome:    CausalOutcome,
  actionType: string,
): CausalAttribution {
  const signals: string[] = [];
  let primaryReason: PrimaryReason = 'mixed_context';
  let confidence = 0.40;

  // ── Negative / Worsened outcomes first (override positive signals) ─────────

  if (outcome.worsened && context.recoveryCount24h >= 3) {
    signals.push('recovery_saturation');
    return { primaryReason: 'over_recovery_loop', contributingSignals: signals, confidence: 0.80 };
  }

  if (outcome.worsened && context.recentFailures >= 5) {
    signals.push('high_recent_failures');
    return { primaryReason: 'unstable_execution_context', contributingSignals: signals, confidence: 0.76 };
  }

  if (outcome.worsened && context.openAnomalyCount >= 3) {
    signals.push('multiple_open_anomalies');
    return { primaryReason: 'unstable_execution_context', contributingSignals: ['multiple_open_anomalies'], confidence: 0.65 };
  }

  // ── Positive outcomes — identify the causal mechanism ────────────────────

  if (outcome.improved && context.runtimeState === 'cold' && actionType === 'seed_jobs') {
    signals.push('cold_start_context');
    primaryReason = 'cold_start_bootstrap';
    confidence = 0.74;
  } else if (outcome.improved && context.queueDepth > 20 &&
    (actionType === 'throttle_system' || actionType === 'increase_throughput')) {
    signals.push('high_queue_depth');
    primaryReason = 'queue_pressure_relief';
    confidence = 0.72;
  } else if (outcome.improved && context.queueDepth <= 5 && actionType === 'increase_throughput') {
    // Throughput bump helped even with empty queue → likely unblocked stale pipeline
    signals.push('low_queue_unblock');
    primaryReason = 'throughput_unblock';
    confidence = 0.60;
  } else if (outcome.improved && context.milestoneCount === 0 && actionType === 'force_publish') {
    signals.push('missing_milestones');
    primaryReason = 'milestone_creation';
    confidence = 0.77;
  } else if (outcome.improved && context.runtimeState === 'warm' && actionType === 'inject_activity') {
    signals.push('warm_stall_context');
    primaryReason = 'activity_injection_warm_stall';
    confidence = 0.68;
  } else if (outcome.improved && actionType === 'stabilize_system' && context.recoveryCount24h >= 2) {
    signals.push('recovery_loop_stabilization');
    primaryReason = 'stabilization_in_progress';
    confidence = 0.65;
  } else if (outcome.anomalyResolved && context.openAnomalyCount <= 1) {
    // Anomaly resolved but hard to attribute — may have been clearing on its own
    signals.push('single_anomaly_context');
    primaryReason = 'anomaly_already_clearing';
    confidence = 0.35;
  }

  // ── Enrich signals regardless of primary ─────────────────────────────────

  if (context.lifecyclePattern.includes('degraded') && context.lifecyclePattern.includes('recovery_action')) {
    signals.push('degrade_recovery_cycle_present');
  }
  if (context.lifecyclePattern.at(-1) === 'recovery_action') {
    signals.push('recent_prior_recovery');
  }
  if (context.healthScore < 40) {
    signals.push('low_health_score');
  }

  if (primaryReason === 'mixed_context' && !outcome.improved && !outcome.worsened) {
    primaryReason = 'insufficient_signal';
    confidence = 0.30;
  }

  return { primaryReason, contributingSignals: signals, confidence };
}

/**
 * lib/system/getInterventionStrategy.ts
 *
 * Pure function — infers the strategic intent of an intervention
 * given the anomaly type, lifecycle stage, and winning action.
 *
 * Strategies:
 *   bootstrap       — cold start, seeds the pipeline
 *   stabilization   — warming tenant, building toward warm state
 *   acceleration    — warm tenant that has stalled or slowed
 *   recovery        — degraded or looping tenant, needs throttling/calming
 *   observation     — insufficient signal, no clear strategy
 *
 * Used in the intervention plan as a human-readable framing
 * for operators reviewing suggested actions.
 */

export type InterventionStrategy =
  | 'bootstrap'
  | 'stabilization'
  | 'acceleration'
  | 'recovery'
  | 'observation';

const BOOTSTRAP_ACTIONS  = new Set(['seed_jobs']);
const RECOVERY_ACTIONS   = new Set(['throttle_system', 'stabilize_system']);
const ACCELERATION_ACTIONS = new Set(['inject_activity', 'increase_throughput', 'force_publish']);

export function getInterventionStrategy(
  anomalyType:    string,
  lifecycleStage: string,
  winnerAction:   string | null,
): InterventionStrategy {
  if (!winnerAction) return 'observation';

  // Recovery takes priority — if the tenant is degraded or looping, it overrides action intent
  if (lifecycleStage === 'degraded' || anomalyType === 'recovery_loop' || anomalyType === 'repeated_degradation') {
    return RECOVERY_ACTIONS.has(winnerAction) || ACCELERATION_ACTIONS.has(winnerAction)
      ? 'recovery'
      : 'recovery';  // degraded state → strategy is always recovery
  }

  // Cold start bootstrap
  if (lifecycleStage === 'cold' && BOOTSTRAP_ACTIONS.has(winnerAction)) {
    return 'bootstrap';
  }

  // Stuck cold — even without seed_jobs, treat as bootstrap context
  if (anomalyType === 'stuck_cold') {
    return 'bootstrap';
  }

  // Warming stabilization
  if (lifecycleStage === 'warming' || anomalyType === 'stuck_warming' || anomalyType === 'missing_milestones') {
    return 'stabilization';
  }

  // Warm acceleration — stalled warm tenants
  if (lifecycleStage === 'warm' && ACCELERATION_ACTIONS.has(winnerAction)) {
    return 'acceleration';
  }

  if (anomalyType === 'silent_warm_tenant') {
    return 'acceleration';
  }

  return 'observation';
}

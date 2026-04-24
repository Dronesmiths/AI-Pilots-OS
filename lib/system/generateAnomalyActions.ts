/**
 * lib/system/generateAnomalyActions.ts
 *
 * Pure mapping function — anomaly type → recommended action.
 * No DB calls, no side effects.
 *
 * autoExecutable: true  → safe to auto-run (bounded, non-destructive)
 * autoExecutable: false → surfaces for operator review
 *
 * Recovery loop is the one case we do NOT auto-execute — repeated recovery
 * attempts need operator judgement before reducing automation intensity.
 */

import { type AnomalyType, type TenantAnomaly } from './detectTenantAnomalies';

export type ActionType =
  | 'seed_jobs'
  | 'increase_throughput'
  | 'throttle_system'
  | 'force_publish'
  | 'inject_activity'
  | 'stabilize_system';

export interface AnomalyActionPlan {
  actionType:      ActionType;
  recommendation:  string;
  autoExecutable:  boolean;
}

const ACTION_MAP: Record<AnomalyType, AnomalyActionPlan> = {
  stuck_cold: {
    actionType:     'seed_jobs',
    recommendation: 'Seed initial DISCOVERY job — verify activation pipeline ran correctly',
    autoExecutable: true,
  },
  stuck_warming: {
    actionType:     'increase_throughput',
    recommendation: 'Inject REINFORCE job to accelerate warming — add queue pressure',
    autoExecutable: true,
  },
  repeated_degradation: {
    actionType:     'throttle_system',
    recommendation: 'Set concurrency cap to 2 — stabilize before ramping back up',
    autoExecutable: true,
  },
  missing_milestones: {
    actionType:     'force_publish',
    recommendation: 'Force a PUBLISH job — tenant needs first page milestone to unblock',
    autoExecutable: true,
  },
  silent_warm_tenant: {
    actionType:     'inject_activity',
    recommendation: 'Inject lightweight REINFORCE job to re-trigger autonomous cycle',
    autoExecutable: true,
  },
  recovery_loop: {
    actionType:     'stabilize_system',
    recommendation: 'Reduce automation intensity and set stabilizationMode — requires operator review',
    autoExecutable: false,   // ← requires human: don't auto-reduce a looping system
  },
};

export function generateAnomalyActions(anomaly: TenantAnomaly): AnomalyActionPlan | null {
  return ACTION_MAP[anomaly.type] ?? null;
}

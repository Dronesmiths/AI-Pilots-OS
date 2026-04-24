/**
 * lib/system/getDegradedActions.ts
 *
 * Returns the set of recovery actions to apply when the system is degraded.
 * These are descriptive intent signals — the execution layer decides how to apply them.
 *
 * Used by:
 *   - RecoveryPanel to show what's being applied
 *   - supervisor to gate advanced cycles
 *   - fleet health endpoint to surface operator alerts
 */

export type DegradedAction =
  | 'pause_policy_promotions'
  | 'pause_bandit_promotions'
  | 'reduce_job_throughput'
  | 'prioritize_recovery_jobs'
  | 'mute_reinforcement'
  | 'surface_operator_alert';

export interface DegradedActionDescriptor {
  action:      DegradedAction;
  description: string;
  autoApply:   boolean; // true = apply automatically, false = surface for operator
}

export function getDegradedActions(): DegradedActionDescriptor[] {
  return [
    {
      action:      'pause_policy_promotions',
      description: 'Do not promote policy experiments while system is degraded',
      autoApply:   true,
    },
    {
      action:      'pause_bandit_promotions',
      description: 'Freeze bandit arm selection — no new promotions',
      autoApply:   true,
    },
    {
      action:      'reduce_job_throughput',
      description: 'Cap concurrent job processing to 8/cycle (degraded policy)',
      autoApply:   true,
    },
    {
      action:      'prioritize_recovery_jobs',
      description: 'Move HEARTBEAT and RECOVERY_CHECK jobs to front of queue',
      autoApply:   true,
    },
    {
      action:      'mute_reinforcement',
      description: 'Pause reinforcement learning cycles until warm',
      autoApply:   true,
    },
    {
      action:      'surface_operator_alert',
      description: 'Emit operator alert — system is degraded, manual review may be needed',
      autoApply:   true,
    },
  ];
}

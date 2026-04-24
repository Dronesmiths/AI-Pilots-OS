/**
 * lib/system/getActionRiskBand.ts
 *
 * Pure function — maps an action type to its intrinsic risk band.
 *
 * Risk bands govern whether live exploration is allowed:
 *   low    → live exploration allowed (safe, reversible actions)
 *   medium → approval or shadow depending on trust tier
 *   high   → shadow only, never live without explicit operator approval
 *
 * band score (0..1) is used in computeExplorationPressure as anomalyRisk.
 */

export type RiskBand = 'low' | 'medium' | 'high';

export interface ActionRiskProfile {
  band:  RiskBand;
  score: number;  // 0..1 (used in exploration pressure calculation)
}

const HIGH_RISK_ACTIONS = new Set([
  'restart_engine', 'disable_module', 'hard_failover', 'force_shutdown', 'kill_process',
]);

const MEDIUM_RISK_ACTIONS = new Set([
  'scale_worker_pool', 'pause_subsystem', 'throttle_system', 'restrict_access',
]);

export function getActionRiskBand(actionType: string): ActionRiskProfile {
  if (HIGH_RISK_ACTIONS.has(actionType))   return { band: 'high',   score: 0.9 };
  if (MEDIUM_RISK_ACTIONS.has(actionType)) return { band: 'medium', score: 0.5 };
  return { band: 'low', score: 0.2 };
}

/**
 * Derives exploration permission from risk band and trust tier.
 * Used by runExplorationExploitationController to set liveExplorationAllowed.
 */
export function isLiveExplorationAllowed(
  actionType:    string,
  trustTier:     string,
): boolean {
  const { band } = getActionRiskBand(actionType);
  if (band === 'high') return false;
  if (band === 'medium') return trustTier === 'elite' || trustTier === 'trusted';
  return true; // low risk always allowed
}

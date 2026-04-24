/**
 * lib/system/evaluateGraphPolicyTrustGate.ts
 *
 * Pure function — determines whether a graph policy rule can be applied live.
 *
 * Shadow mode is always allowed (no gate needed).
 * Active/limited mode requires passing trust tier and risk band checks.
 *
 * Returns: allowed (boolean), mode (what it can operate in), rationale.
 */

export type TrustTier = 'elite' | 'trusted' | 'high' | 'medium' | 'low' | 'watch' | 'risky' | 'probation';
export type RiskBand  = 'low' | 'medium' | 'high';
export type RolloutMode = 'shadow' | 'limited' | 'active';
export type GateMode  = 'shadow' | 'limited' | 'active' | 'blocked' | 'approval_required';

export interface TrustGateResult {
  allowed:  boolean;
  mode:     GateMode;
  rationale:string;
}

const HIGH_TRUST_TIERS = new Set(['elite', 'trusted', 'high']);

export function evaluateGraphPolicyTrustGate(input: {
  trustTier:                string;
  operatorApprovalRequired: boolean;
  actionRiskBand:           RiskBand;
  rolloutMode:              RolloutMode;
}): TrustGateResult {
  // Shadow always allowed — no gate
  if (input.rolloutMode === 'shadow') {
    return { allowed: true, mode: 'shadow', rationale: 'Shadow mode authorized by default' };
  }

  if (input.operatorApprovalRequired) {
    return { allowed: false, mode: 'approval_required', rationale: 'Operator approval required for this policy rule' };
  }

  if (input.actionRiskBand === 'high' && !HIGH_TRUST_TIERS.has(input.trustTier)) {
    return { allowed: false, mode: 'blocked', rationale: 'High-risk policy blocked — requires elite/trusted/high trust tier' };
  }

  if (input.rolloutMode === 'limited') {
    return { allowed: true, mode: 'limited', rationale: 'Limited rollout authorized under current trust and risk conditions' };
  }

  return { allowed: true, mode: 'active', rationale: 'Policy rule authorized for active use' };
}

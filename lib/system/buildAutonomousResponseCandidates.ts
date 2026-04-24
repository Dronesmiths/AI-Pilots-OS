/**
 * lib/system/buildAutonomousResponseCandidates.ts
 * lib/system/evaluateAutonomousResponseGate.ts
 * lib/system/evaluateAutonomousResponseOutcome.ts
 *
 * Three related pure functions for the response lifecycle.
 * Kept in one file — all are stateless and tightly coupled.
 */
import connectToDatabase         from '@/lib/mongodb';
import AutonomousResponsePolicy  from '@/models/system/AutonomousResponsePolicy';

// ── 1. Candidate builder ───────────────────────────────────────────────────
export interface ResponseCandidate {
  action:   string;
  riskBand: 'low' | 'medium' | 'high';
  priority: number;
}

const TRIGGER_RESPONSES: Record<string, ResponseCandidate[]> = {
  arbitration_spike: [
    { action: 'trigger_replay_scan',        riskBand: 'low',    priority: 1 },
    { action: 'reduce_policy_weight_shadow', riskBand: 'low',    priority: 2 },
    { action: 'widen_exploration',           riskBand: 'low',    priority: 3 },
  ],
  blocked_rate_spike: [
    { action: 'shift_autonomy_to_shadow',   riskBand: 'low',    priority: 1 },
    { action: 'approval_queue_review',       riskBand: 'low',    priority: 2 },
  ],
  execution_failure_spike: [
    { action: 'flag_for_review',            riskBand: 'low',    priority: 1 },
    { action: 'pause_automation',            riskBand: 'medium', priority: 2 },
  ],
  override_spike: [
    { action: 'trigger_replay_scan',        riskBand: 'low',    priority: 1 },
    { action: 'flag_for_review',            riskBand: 'low',    priority: 2 },
  ],
  weight_rollback_risk: [
    { action: 'pause_weight_profile',       riskBand: 'medium', priority: 1 },
    { action: 'rollback_weight_profile',    riskBand: 'medium', priority: 2 },
  ],
  confidence_drift: [
    { action: 'widen_exploration',          riskBand: 'low',    priority: 1 },
    { action: 'flag_for_review',            riskBand: 'low',    priority: 2 },
  ],
  champion_decay: [
    { action: 'reopen_scope',              riskBand: 'low',    priority: 1 },
    { action: 'restore_previous_champion', riskBand: 'medium', priority: 2 },
  ],
  policy_harm_rise: [
    { action: 'rollback_rule',             riskBand: 'medium', priority: 1 },
    { action: 'policy_override',           riskBand: 'high',   priority: 2 },
  ],
  replay_disagreement_cluster: [
    { action: 'trigger_replay_scan',       riskBand: 'low',    priority: 1 },
    { action: 'flag_for_review',           riskBand: 'low',    priority: 2 },
  ],
  inheritance_mismatch: [
    { action: 'widen_exploration',         riskBand: 'low',    priority: 1 },
    { action: 'reopen_scope',             riskBand: 'low',    priority: 2 },
  ],
};

export function buildAutonomousResponseCandidates(input: {
  triggerType: string;
  severity:    'low' | 'medium' | 'high' | 'critical';
  metrics?:    any;
}): ResponseCandidate[] {
  const candidates = TRIGGER_RESPONSES[input.triggerType] ?? [{ action: 'observe_only', riskBand: 'low' as const, priority: 0 }];
  // For critical severity, exclude high-risk choices — require explicit approval
  if (input.severity === 'critical') {
    return candidates.filter(c => c.riskBand !== 'high').sort((a, b) => a.priority - b.priority);
  }
  return candidates.sort((a, b) => a.priority - b.priority);
}

// ── 2. Trust gate ─────────────────────────────────────────────────────────
export type GateVerdict = 'allow' | 'allow_shadow' | 'approval_required' | 'block';

export interface GateResult {
  verdict:       GateVerdict;
  responseClass: string;
  reason:        string;
}

const RISK_ORDER = { low: 1, medium: 2, high: 3 };
const SEV_ORDER  = { low: 1, medium: 2, high: 3, critical: 4, never: 99 };

export async function evaluateAutonomousResponseGate(input: {
  triggerSeverity: 'low' | 'medium' | 'high' | 'critical';
  riskBand:        'low' | 'medium' | 'high';
  triggerType:     string;
}): Promise<GateResult> {
  await connectToDatabase();

  // Check global freeze
  const globalFreeze = await AutonomousResponsePolicy.findOne({ policyKey: 'global_freeze' }).lean() as any;
  if (globalFreeze && globalFreeze.enabled === false) {
    return { verdict: 'block', responseClass: 'observe', reason: 'Global autonomous response freeze is active' };
  }

  // Load policy for this trigger type
  const policy = await AutonomousResponsePolicy.findOne({ triggerType: input.triggerType, enabled: true }).lean() as any;
  if (!policy) {
    // No policy configured = conservative default
    return { verdict: 'allow_shadow', responseClass: 'shadow', reason: 'No response policy configured — defaulting to shadow' };
  }

  // Risk band check
  if (RISK_ORDER[input.riskBand] > RISK_ORDER[policy.maxRiskBand as keyof typeof RISK_ORDER]) {
    return { verdict: 'approval_required', responseClass: 'approval_required', reason: `Response risk '${input.riskBand}' exceeds policy max '${policy.maxRiskBand}'` };
  }

  // Severity threshold check
  const sevThreshold = policy.requireApprovalAboveSeverity as keyof typeof SEV_ORDER;
  if (sevThreshold !== 'never' && SEV_ORDER[input.triggerSeverity] >= SEV_ORDER[sevThreshold]) {
    return { verdict: 'approval_required', responseClass: 'approval_required', reason: `Severity '${input.triggerSeverity}' meets approval threshold '${sevThreshold}'` };
  }

  // Check if this is shadow-only (low confidence policy)
  if (policy.defaultResponseClass === 'shadow') {
    return { verdict: 'allow_shadow', responseClass: 'shadow', reason: 'Policy allows shadow execution only' };
  }

  return { verdict: 'allow', responseClass: policy.defaultResponseClass, reason: 'Response permitted by autonomous response policy' };
}

// ── 3. Outcome evaluator ──────────────────────────────────────────────────
export function evaluateAutonomousResponseOutcome(input: {
  beforeSnapshot: any;
  afterSnapshot:  any;
}): { quality: 'strong_hit' | 'partial_hit' | 'weak_hit' | 'miss' | 'harmful'; delta: number } {
  const before = input.beforeSnapshot?.rollbackScore ?? input.beforeSnapshot?.blockedRate ?? 0;
  const after  = input.afterSnapshot?.rollbackScore  ?? input.afterSnapshot?.blockedRate  ?? 0;
  const delta  = before - after;  // positive = improvement (risk reduced)

  const quality =
    delta >= 25  ? 'strong_hit'  :
    delta >= 10  ? 'partial_hit' :
    delta >= 0   ? 'weak_hit'    :
    delta > -15  ? 'miss'        : 'harmful';

  return { quality, delta };
}

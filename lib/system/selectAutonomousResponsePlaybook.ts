/**
 * lib/system/selectAutonomousResponsePlaybook.ts
 *
 * Pure function — selects the best matching playbook for a trigger+context.
 * Scoring: scope selector matches + wildcard preference (specific > wildcard).
 * Not async — callers pre-load available playbooks.
 */
import type { CheckpointType } from './evaluatePlaybookCheckpoint';

export interface ScopeContext {
  anomalyType?:    string;
  lifecycleStage?: string;
  trustTier?:      string;
  scopeFamily?:    string;
}

export function selectAutonomousResponsePlaybook(input: {
  triggerType:       string;
  scopeContext:      ScopeContext;
  availablePlaybooks: any[];
}): any | null {
  const eligible = input.availablePlaybooks.filter(p => {
    if (!p.enabled) return false;
    return (p.triggerTypes ?? []).includes(input.triggerType);
  });

  if (!eligible.length) return null;

  const ranked = eligible.map(p => {
    let score = 0;
    const sel = p.scopeSelector ?? {};
    // Specific match > wildcard — score higher for exact matches
    if (sel.anomalyType    === input.scopeContext.anomalyType)    score += 20;
    else if (sel.anomalyType    === '*') score += 5;
    if (sel.lifecycleStage === input.scopeContext.lifecycleStage) score += 15;
    else if (sel.lifecycleStage === '*') score += 4;
    if (sel.trustTier      === input.scopeContext.trustTier)      score += 10;
    else if (sel.trustTier      === '*') score += 3;
    if (sel.scopeFamily    === input.scopeContext.scopeFamily)     score += 12;
    else if (sel.scopeFamily    === '*') score += 3;
    // Tie-break: playbooks with fewer steps preferred (less disruption)
    score -= (p.steps?.length ?? 0) * 0.5;
    return { playbook: p, score };
  }).sort((a, b) => b.score - a.score);

  return ranked[0]?.playbook ?? null;
}

// ── Built-in playbook seeds ───────────────────────────────────────────────
// These seed data objects are imported by the /api/admin/autonomous-playbooks/seeds route
// to pre-populate the DB with the 5 canonical playbook types. They are NOT auto-inserted;
// the operator must explicitly seed them.

export const CANONICAL_PLAYBOOKS = [
  {
    playbookKey:  'arbitration_recovery::*',
    playbookType: 'arbitration_recovery',
    triggerTypes: ['arbitration_spike', 'blocked_rate_spike'],
    maxTotalRiskBand: 'medium',
    requireApprovalAtOrAboveStepRisk: 'high',
    steps: [
      { stepKey: 'replay_scan',          stepOrder: 1, actionType: 'trigger_replay_scan',         responseClass: 'auto_execute', riskBand: 'low',    checkpointType: 'none',               onSuccess: 'next_step', onFailure: 'retry',   maxRetries: 1 },
      { stepKey: 'reduce_policy_shadow', stepOrder: 2, actionType: 'reduce_policy_weight_shadow',  responseClass: 'shadow',       riskBand: 'low',    checkpointType: 'stability_check',    onSuccess: 'next_step', onFailure: 'abort',   maxRetries: 0, checkpointConfig: {} },
      { stepKey: 'widen_exploration',    stepOrder: 3, actionType: 'widen_exploration',            responseClass: 'shadow',       riskBand: 'low',    checkpointType: 'metric_drop',        onSuccess: 'complete',  onFailure: 'escalate',maxRetries: 0, checkpointConfig: { metric: 'arbitrationRate', requiredDrop: 5 } },
    ],
  },
  {
    playbookKey:  'rollback_containment::*',
    playbookType: 'rollback_containment',
    triggerTypes: ['weight_rollback_risk'],
    maxTotalRiskBand: 'medium',
    requireApprovalAtOrAboveStepRisk: 'high',
    steps: [
      { stepKey: 'pause_weight',   stepOrder: 1, actionType: 'pause_weight_profile',   responseClass: 'shadow',       riskBand: 'medium', checkpointType: 'stability_check',    onSuccess: 'next_step', onFailure: 'escalate',maxRetries: 0, checkpointConfig: {} },
      { stepKey: 'shadow_prior',   stepOrder: 2, actionType: 'shift_autonomy_to_shadow',responseClass: 'shadow',       riskBand: 'low',    checkpointType: 'metric_drop',        onSuccess: 'complete',  onFailure: 'escalate',maxRetries: 0, checkpointConfig: { metric: 'rollbackScore', requiredDrop: 10 } },
    ],
  },
  {
    playbookKey:  'champion_decay_recovery::*',
    playbookType: 'champion_decay_recovery',
    triggerTypes: ['champion_decay'],
    maxTotalRiskBand: 'medium',
    requireApprovalAtOrAboveStepRisk: 'high',
    steps: [
      { stepKey: 'reopen_scope',   stepOrder: 1, actionType: 'reopen_scope',             responseClass: 'auto_execute', riskBand: 'low',    checkpointType: 'none',               onSuccess: 'next_step', onFailure: 'retry',   maxRetries: 1 },
      { stepKey: 'demote_champion',stepOrder: 2, actionType: 'restore_previous_champion', responseClass: 'shadow',       riskBand: 'medium', checkpointType: 'stability_check',    onSuccess: 'complete',  onFailure: 'escalate',maxRetries: 0, checkpointConfig: {} },
    ],
  },
  {
    playbookKey:  'policy_harm_containment::*',
    playbookType: 'policy_harm_containment',
    triggerTypes: ['policy_harm_rise', 'replay_disagreement_cluster'],
    maxTotalRiskBand: 'medium',
    requireApprovalAtOrAboveStepRisk: 'medium',
    steps: [
      { stepKey: 'pause_rule',     stepOrder: 1, actionType: 'rollback_rule',            responseClass: 'shadow',       riskBand: 'medium', checkpointType: 'conflict_reduction', onSuccess: 'complete',  onFailure: 'escalate',maxRetries: 0, checkpointConfig: {} },
    ],
  },
  {
    playbookKey:  'confidence_stabilization::*',
    playbookType: 'confidence_stabilization',
    triggerTypes: ['confidence_drift'],
    maxTotalRiskBand: 'low',
    requireApprovalAtOrAboveStepRisk: 'medium',
    steps: [
      { stepKey: 'increase_doubt', stepOrder: 1, actionType: 'shift_autonomy_to_shadow', responseClass: 'shadow',       riskBand: 'low',    checkpointType: 'none',               onSuccess: 'next_step', onFailure: 'retry',   maxRetries: 1 },
      { stepKey: 'widen_replay',   stepOrder: 2, actionType: 'trigger_replay_scan',       responseClass: 'auto_execute', riskBand: 'low',    checkpointType: 'metric_drop',        onSuccess: 'complete',  onFailure: 'escalate',maxRetries: 0, checkpointConfig: { metric: 'blockedRate', requiredDrop: 5 } },
    ],
  },
];

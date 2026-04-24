/**
 * lib/system/evaluatePlaybookCheckpoint.ts
 * lib/system/evaluatePlaybookAbort.ts
 * lib/system/evaluatePlaybookEscalation.ts
 *
 * Three pure safety functions for the playbook state machine.
 * All are synchronous — no DB access. Callers provide pre-loaded snapshots.
 */

// ── 1. Checkpoint evaluator ────────────────────────────────────────────────
export type CheckpointType = 'metric_drop' | 'metric_rise' | 'stability_check' | 'conflict_reduction' | 'manual_review' | 'none';

export interface CheckpointResult {
  passed:  boolean;
  reason:  string;
  metrics: Record<string, any>;
}

export function evaluatePlaybookCheckpoint(input: {
  checkpointType:   CheckpointType;
  checkpointConfig: any;
  beforeSnapshot:   any;
  afterSnapshot:    any;
}): CheckpointResult {
  const { checkpointType: type, checkpointConfig: cfg, beforeSnapshot: before, afterSnapshot: after } = input;

  if (type === 'none') return { passed: true,  reason: 'No checkpoint required', metrics: {} };

  if (type === 'manual_review') return { passed: false, reason: 'Awaiting manual review', metrics: {} };

  if (type === 'metric_drop') {
    const metric      = cfg?.metric ?? 'rollbackScore';
    const required    = cfg?.requiredDrop   ?? 5;
    const beforeVal   = before?.[metric] ?? 0;
    const afterVal    = after?.[metric]  ?? 0;
    const delta       = beforeVal - afterVal;
    return {
      passed:  delta >= required,
      reason:  delta >= required ? `${metric} dropped by ${delta.toFixed(1)} (required ≥${required})` : `${metric} only dropped by ${delta.toFixed(1)} (required ≥${required})`,
      metrics: { metric, before: beforeVal, after: afterVal, delta },
    };
  }

  if (type === 'metric_rise') {
    const metric    = cfg?.metric ?? 'executionRate';
    const required  = cfg?.requiredRise ?? 0.05;
    const beforeVal = before?.[metric] ?? 0;
    const afterVal  = after?.[metric]  ?? 0;
    const delta     = afterVal - beforeVal;
    return {
      passed:  delta >= required,
      reason:  delta >= required ? `${metric} rose by ${delta.toFixed(3)}` : `${metric} insufficient rise: ${delta.toFixed(3)}`,
      metrics: { metric, before: beforeVal, after: afterVal, delta },
    };
  }

  if (type === 'stability_check') {
    const beforeScore = before?.rollbackScore ?? before?.blockedRate ?? 0;
    const afterScore  = after?.rollbackScore  ?? after?.blockedRate  ?? 0;
    const delta       = beforeScore - afterScore;
    return {
      passed:  delta > 0,
      reason:  delta > 0 ? `Stability improved by ${delta.toFixed(1)}` : `Stability did not improve (delta ${delta.toFixed(1)})`,
      metrics: { before: beforeScore, after: afterScore, delta },
    };
  }

  if (type === 'conflict_reduction') {
    const beforeConflicts = before?.totalConflicts ?? before?.conflictCount ?? 0;
    const afterConflicts  = after?.totalConflicts  ?? after?.conflictCount  ?? 0;
    const delta           = beforeConflicts - afterConflicts;
    return {
      passed:  afterConflicts < beforeConflicts,
      reason:  afterConflicts < beforeConflicts ? `Conflicts reduced by ${delta}` : `Conflicts unchanged or increased (${afterConflicts} vs ${beforeConflicts})`,
      metrics: { before: beforeConflicts, after: afterConflicts, delta },
    };
  }

  return { passed: false, reason: `Unknown checkpoint type: ${type}`, metrics: {} };
}

// ── 2. Abort evaluator ────────────────────────────────────────────────────
export interface AbortResult {
  abort:  boolean;
  reason: string;
}

export function evaluatePlaybookAbort(input: {
  stepOutcome?:         { quality?: string; delta?: number };
  rollbackScoreBefore?: number;
  rollbackScoreAfter?:  number;
  retryCount:           number;
  maxRetries:           number;
  governanceBlocked?:   boolean;
  operatorFreeze?:      boolean;
}): AbortResult {
  if (input.operatorFreeze) return { abort: true, reason: 'Operator freeze active — playbook halted' };
  if (input.governanceBlocked) return { abort: true, reason: 'Governance blocked this step — playbook cannot continue safely' };

  if ((input.stepOutcome?.quality ?? '') === 'harmful') return { abort: true, reason: 'Step produced harmful outcome' };

  // Rollback risk materially worsened (>15 point spike)
  const rsBefore = input.rollbackScoreBefore ?? 0;
  const rsAfter  = input.rollbackScoreAfter  ?? 0;
  if (rsAfter > rsBefore + 15) return { abort: true, reason: `Rollback risk spiked: ${rsBefore} → ${rsAfter} (+${rsAfter - rsBefore})` };

  // Retry limit exceeded
  if (input.retryCount > input.maxRetries) return { abort: true, reason: `Retry limit exceeded (${input.retryCount}/${input.maxRetries})` };

  return { abort: false, reason: '' };
}

// ── 3. Escalation evaluator ───────────────────────────────────────────────
export type EscalationLevel = 'none' | 'approval_required' | 'operator_review' | 'emergency';

export interface EscalationResult {
  escalate: boolean;
  level:    EscalationLevel;
  reason:   string;
}

const RISK_ORDER = { low: 1, medium: 2, high: 3 } as const;
const SEV_ORDER  = { low: 1, medium: 2, high: 3, critical: 4 } as const;

export function evaluatePlaybookEscalation(input: {
  triggerSeverity:   'low' | 'medium' | 'high' | 'critical';
  checkpointPassed:  boolean;
  retryCount:        number;
  nextStepRiskBand?: 'low' | 'medium' | 'high';
  maxAutoRiskBand:   'low' | 'medium' | 'high';
  currentEscalation?: EscalationLevel;
}): EscalationResult {
  // Don't de-escalate — escalation is monotonic within a run
  const currentLevel = SEV_ORDER[input.currentEscalation === 'approval_required' ? 'low' : input.currentEscalation === 'operator_review' ? 'medium' : input.currentEscalation === 'emergency' ? 'critical' : 'low'] ?? 0;

  // Repeated checkpoint failure → approval required
  if (!input.checkpointPassed && input.retryCount >= 1) {
    return { escalate: true, level: 'approval_required', reason: `Checkpoint failed ${input.retryCount + 1} times — operator approval required` };
  }

  // Next step risk exceeds auto-response ceiling
  if (input.nextStepRiskBand &&
      RISK_ORDER[input.nextStepRiskBand] > RISK_ORDER[input.maxAutoRiskBand]) {
    return { escalate: true, level: 'operator_review', reason: `Next step '${input.nextStepRiskBand}' risk exceeds auto ceiling '${input.maxAutoRiskBand}'` };
  }

  // Critical severity always escalates
  if (input.triggerSeverity === 'critical') {
    return { escalate: true, level: 'emergency', reason: 'Critical severity trigger requires emergency handling' };
  }

  return { escalate: false, level: 'none', reason: '' };
}

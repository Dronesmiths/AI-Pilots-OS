/**
 * lib/system/simulateGovernedDecision.ts
 *
 * NON-PERSISTING simulation of the governed decision pipeline.
 *
 * This is the REPLAY-SAFE version of buildGovernedDecision.
 * It runs the same arbitration and governance logic but:
 *   1. Does NOT write to GovernedDecisionRecord (no side effects)
 *   2. Uses a synthetic replay traceId ({originalTraceId}::replay::{variant})
 *   3. Returns the envelope as a plain object (not the DB document)
 *
 * RULE: Replay must never call routeExecution or executeGovernedAction.
 * This function exists specifically to enforce that boundary.
 */
import { runArbitration }               from '@/lib/system/runArbitration';
import { evaluateOperatorCommand }      from '@/lib/governance/evaluateOperatorCommand';
import { runOperatorConstitutionalCheck } from '@/lib/governance/runOperatorConstitutionalCheck';
import { generateRollbackPlan }         from '@/lib/governance/generateRollbackPlan';
import type { ReplayState }             from './reconstructReplayState';

export interface SimulatedEnvelope {
  traceId:         string;  // synthetic replay traceId
  tenantId:        string;
  scopeKey:        string;
  anomalyType:     string;
  anomalySeverity: string;
  contextSnapshot: Record<string, any>;
  plannerCandidates:   any[];
  policyInfluences:    any[];
  inheritedInfluences: any[];
  marketEvidence:      any[];
  arbitration:         any;
  operatorGovernance:  any;
  finalDecision: {
    actionType:    string | null;
    executionMode: string;
    confidence:    string;
    reasoning:     string;
    source:        string;
  };
  authorityPath:   string[];
  authoritySource: string;
  rollbackPlan:    any;
  isSimulation:    true;   // explicit marker — never confuse with live decisions
}

export async function simulateGovernedDecision(
  state:       ReplayState,
  variantType: string,
): Promise<SimulatedEnvelope> {
  const authorityPath: string[] = [];

  // Determine planner winner from potentially-mutated candidates
  const winner = state.plannerCandidates
    .slice()
    .sort((a: any, b: any) => (b.adjustedScore ?? 0) - (a.adjustedScore ?? 0))[0] ?? null;

  // Top active policy influence (non-shadow, boosting)
  const topPolicyRule = state.policyInfluences
    .find((p: any) => p.rolloutMode !== 'shadow' && p.policyType === 'action_boost') ?? null;

  // Best market evidence entry
  const champStanding = state.marketEvidence
    .find((m: any) => m.role === 'champion') ?? null;

  // If arbitration was force-mutated, apply it here
  let arbResult;
  if (state.arbitration?.forcedWinner) {
    arbResult = {
      actionType:          state.arbitration.forcedWinner,
      source:              state.arbitration.forcedSource ?? 'challenger',
      conflictType:        'arbitration_alt_winner',
      wasConflict:         true,
      scoreMargin:         0,
      shadowTestTriggered: false,
      authorityScores:     {},
      reasoning:           `Replay: forced winner ${state.arbitration.forcedWinner}`,
    };
  } else {
    arbResult = runArbitration({
      planner: {
        actionType:    winner?.actionType    ?? null,
        adjustedScore: winner?.adjustedScore ?? 0,
        confidence:    winner?.confidence    ?? 'low',
      },
      policy: topPolicyRule ? {
        actionType:  topPolicyRule.targetAction ?? topPolicyRule.actionType ?? null,
        ruleKey:     topPolicyRule.ruleKey    ?? null,
        ruleWeight:  topPolicyRule.value      ?? topPolicyRule.ruleWeight ?? 0,
        rolloutMode: topPolicyRule.rolloutMode,
      } : null,
      champion: champStanding ? {
        actionType:     champStanding.actionType,
        successRate:    champStanding.winRate       ?? champStanding.successRate ?? 0,
        lockConfidence: champStanding.lockConfidence ?? 0,
      } : null,
      operator: null,
      calibrationError: 0,
    });
  }

  authorityPath.push('constitutional_arbitration');

  // Operator governance — skip if mutation removed it
  let operatorGovernance: any = { override: false };
  let operatorForcedAction: string | null = null;

  if (state.operatorGovernance?.override) {
    // Re-evaluate the operator command with the mutated context
    const constCheck = runOperatorConstitutionalCheck({
      commandClass:    state.operatorGovernance.commandClass ?? 'planner_override',
      commandMode:     'override',
      commandRiskBand: 'medium',
      operator:        { role: 'admin', trustTier: 'high', emergencyPrivileges: {} },
    });
    const govResult = evaluateOperatorCommand({
      operator: { active: true, trustTier: 'high', role: 'admin', scopeAccess: { tenantIds: [], scopePrefixes: [], allowGlobal: false } },
      grant:    null,
      request:  { commandMode: 'override', commandRiskBand: 'medium', commandClass: 'planner_override' },
      constitutionalCheck: constCheck,
    });
    if (govResult.verdict === 'allow' && state.operatorGovernance.forcedAction) {
      operatorForcedAction   = state.operatorGovernance.forcedAction;
      operatorGovernance     = { override: true, reason: govResult.reason };
      authorityPath.push('operator_override');
    }
  }

  const useOperator     = operatorGovernance.override && operatorForcedAction;
  const finalActionType = useOperator ? operatorForcedAction : arbResult.actionType;
  const finalSource     = useOperator ? 'operator' : (arbResult.source ?? 'none');

  let executionMode = 'suggest';
  if (useOperator)                  executionMode = 'auto';
  else if (arbResult.shadowTestTriggered) executionMode = 'shadow';
  else if (!arbResult.wasConflict && arbResult.source === 'champion') executionMode = 'auto';

  const finalDecision = {
    actionType:    finalActionType,
    executionMode,
    confidence:    winner?.confidence ?? 'low',
    reasoning:     useOperator ? `Replay operator override` : arbResult.reasoning,
    source:        finalSource,
  };

  const rollbackPlan = generateRollbackPlan(finalDecision, { scopeKey: state.scopeKey, tenantId: state.tenantId });

  return {
    traceId:             `${state.traceId}::replay::${variantType}`,
    tenantId:            state.tenantId,
    scopeKey:            state.scopeKey,
    anomalyType:         state.anomalyType,
    anomalySeverity:     state.anomalySeverity,
    contextSnapshot:     state.contextSnapshot,
    plannerCandidates:   state.plannerCandidates,
    policyInfluences:    state.policyInfluences,
    inheritedInfluences: state.inheritedInfluences,
    marketEvidence:      state.marketEvidence,
    arbitration:         arbResult,
    operatorGovernance,
    finalDecision,
    authorityPath,
    authoritySource: finalSource,
    rollbackPlan,
    isSimulation:    true,
  };
}

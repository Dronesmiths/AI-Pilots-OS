/**
 * lib/system/dispatchAutonomousResponse.ts
 *
 * 🔒 THE ONLY PATH FOR AUTONOMOUS ACTION EXECUTION
 *
 * Routes an autonomous response through the governed decision system.
 * Every autonomous intervention MUST pass through:
 *   buildDecisionContextEnvelope → buildGovernedDecision → routeExecution
 *
 * Nothing is direct. No rollbacks, no rule pauses, no demotions happen here.
 * The response is converted to a governed planner candidate and submitted
 * to the same pipeline as any operator or system decision.
 *
 * This ensures:
 *   - Every autonomous action has a GovernedDecisionRecord (full trace)
 *   - Constitutional arbitration still runs
 *   - Operator governance still applies
 *   - Bypass-proof enforcement is never circumvented
 */
import { buildDecisionContextEnvelope } from '@/lib/governance/buildDecisionContextEnvelope';
import { buildGovernedDecision }        from '@/lib/governance/buildGovernedDecision';
import { routeExecution }               from '@/lib/governance/routeExecution';
import connectToDatabase                from '@/lib/mongodb';
import { buildWorldModelConfidenceEnvelope } from '@/lib/system/worldModelConfidenceRouter';
import AutonomousResponseExecution      from '@/models/system/AutonomousResponseExecution';
import AutonomousResponseTrigger        from '@/models/system/AutonomousResponseTrigger';

export interface DispatchInput {
  trigger: any;
  responsePlan: {
    responseAction:  string;
    responseClass:   string;
    riskBand:        'low' | 'medium' | 'high';
    rationale:       string;
  };
  gateResult: {
    verdict:       string;
    responseClass: string;
    reason:        string;
  };
}

export interface DispatchResult {
  responseKey:       string;
  traceId:           string | null;
  governanceVerdict: string;
  executionStatus:   string;
  executionResult?:  any;
}

export async function dispatchAutonomousResponse(input: DispatchInput): Promise<DispatchResult> {
  await connectToDatabase();

  const { trigger, responsePlan, gateResult } = input;
  const responseKey = `${trigger.triggerKey}::response::${Date.now()}`;

  // Map response class to execution mode for the governed envelope
  const executionMode = gateResult.responseClass === 'auto_execute' ? 'auto' :
                        gateResult.responseClass === 'shadow'       ? 'shadow' : 'suggest';

  // ── Blocked: record and return ────────────────────────────────────────
  if (gateResult.verdict === 'block') {
    await AutonomousResponseExecution.create({
      responseKey, triggerKey: trigger.triggerKey, traceId: null,
      responseAction: responsePlan.responseAction, responseClass: responsePlan.responseClass,
      riskBand: responsePlan.riskBand, governanceVerdict: 'block', executionStatus: 'blocked',
      beforeSnapshot: trigger.metrics,
    });
    await AutonomousResponseTrigger.updateOne({ triggerKey: trigger.triggerKey }, { $set: { status: 'suppressed' } });
    return { responseKey, traceId: null, governanceVerdict: 'block', executionStatus: 'blocked' };
  }

  // ── Approval required: create planned record and await ────────────────
  if (gateResult.verdict === 'approval_required') {
    await AutonomousResponseExecution.create({
      responseKey, triggerKey: trigger.triggerKey, traceId: null,
      responseAction: responsePlan.responseAction, responseClass: 'approval_required',
      riskBand: responsePlan.riskBand, governanceVerdict: 'approval_required', executionStatus: 'planned',
      beforeSnapshot: trigger.metrics,
    });
    await AutonomousResponseTrigger.updateOne({ triggerKey: trigger.triggerKey }, { $set: { status: 'planned', recommendedResponseClass: 'approval_required' } });
    return { responseKey, traceId: null, governanceVerdict: 'approval_required', executionStatus: 'planned' };
  }

  // ── Build governed decision envelope (THE ONLY VALID EXECUTION PATH) ──
  const context = buildDecisionContextEnvelope({
    tenantId:        trigger.tenantId ?? 'system',
    scopeKey:        trigger.scopeKey ?? `autonomous::${trigger.triggerType}`,
    anomalyType:     trigger.triggerType,
    anomalySeverity: trigger.severity,
    lifecycleStage:  'active',
    trustTier:       responsePlan.riskBand === 'low' ? 'high' : 'medium',
    riskBand:        responsePlan.riskBand,
    contextSnapshot: { ...trigger.metrics, responseClass: responsePlan.responseClass, rationale: responsePlan.rationale },
  });

  // The autonomous response action becomes the planner winner
  const plannerWinner = {
    actionType:    responsePlan.responseAction,
    adjustedScore: responsePlan.riskBand === 'low' ? 85 : responsePlan.riskBand === 'medium' ? 65 : 45,
    confidence:    responsePlan.riskBand === 'low' ? 'high' : 'medium',
  };

  // ── World model confidence: derive real calibrationError from live signals ──
  // buildWorldModelConfidenceEnvelope never throws — falls back to cautious neutral.
  const wmConfidence = await buildWorldModelConfidenceEnvelope({
    tenantId:  context.tenantId,
    scopeKey:  `${context.anomalyType}::${context.lifecycleStage ?? 'active'}::${responsePlan.riskBand === 'low' ? 'high' : 'medium'}::*`,
  });
  // calibrationError = 1 - plannerCalibration (higher error = more authority penalty in arbitration)
  const calibrationError = +(1 - wmConfidence.dimensions.plannerCalibration).toFixed(3);

  const envelope = await buildGovernedDecision({
    context: {
      ...context,
      contextSnapshot: {
        ...context.contextSnapshot,
        worldModelPosture:         wmConfidence.posture,
        worldModelScore:           wmConfidence.score,
        routingConflictModeHint:   wmConfidence.adjustments.conflictModeOverride,
        routingLocalTruthBias:     wmConfidence.adjustments.localTruthBias,
        preferShadowFirst:         wmConfidence.adjustments.preferShadowFirst,
      },
    },
    plannerCandidates: [plannerWinner],
    plannerWinner,
    calibrationError,
  });

  // Force executionMode to match gate result (override envelope default for shadow/auto)
  (envelope.finalDecision as any).executionMode = executionMode;

  // ── Route through bypass-proof execution ────────────────────────────
  let execResult: any = null;
  let execStatus = 'submitted';

  try {
    execResult  = await routeExecution(envelope);
    execStatus  = execResult.status ?? 'executed';
  } catch (err: any) {
    execStatus  = 'blocked';
    execResult  = { error: err?.message };
  }

  // ── Persist execution record ─────────────────────────────────────────
  await AutonomousResponseExecution.create({
    responseKey,
    triggerKey:        trigger.triggerKey,
    traceId:           context.traceId,
    responseAction:    responsePlan.responseAction,
    responseClass:     responsePlan.responseClass,
    riskBand:          responsePlan.riskBand,
    governanceVerdict: gateResult.verdict,
    executionStatus:   execStatus,
    beforeSnapshot:    trigger.metrics,
  });

  await AutonomousResponseTrigger.updateOne(
    { triggerKey: trigger.triggerKey },
    { $set: { status: 'executed', recommendedResponseClass: gateResult.responseClass } }
  );

  return { responseKey, traceId: context.traceId, governanceVerdict: gateResult.verdict, executionStatus: execStatus, executionResult: execResult };
}

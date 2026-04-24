/**
 * lib/system/runPlaybookStep.ts
 *
 * Executes one playbook step through the governed path.
 *
 * DESIGN RULE: This function MUST use dispatchAutonomousResponse.
 * No direct mutations. No raw DB calls for action side-effects.
 * Every step creates a GovernedDecisionRecord (governed traceId).
 *
 * It also:
 *   1. Captures before-snapshot from latest MetaGovernorSnapshot
 *   2. Evaluates abort gate before dispatch
 *   3. Returns traceId, status, and before/after snapshot refs
 *      (after-snapshot is populated later by the checkpoint observer)
 */
import connectToDatabase              from '@/lib/mongodb';
import MetaGovernorSnapshot           from '@/models/system/MetaGovernorSnapshot';
import AutonomousResponsePlaybookStepRun from '@/models/system/AutonomousResponsePlaybookStepRun';
import AutonomousResponsePolicy       from '@/models/system/AutonomousResponsePolicy';
import { dispatchAutonomousResponse } from './dispatchAutonomousResponse';
import { evaluateAutonomousResponseGate } from './buildAutonomousResponseCandidates';
import { evaluatePlaybookAbort }      from './evaluatePlaybookCheckpoint';

const RISK_ORDER = { low: 1, medium: 2, high: 3 } as const;

export interface PlaybookStepResult {
  stepRunKey:      string;
  traceId:         string | null;
  status:          string;
  governedVerdict: string;
  beforeSnapshot:  any;
  aborted:         boolean;
  abortReason:     string;
}

export async function runPlaybookStep(input: {
  run:  any;    // AutonomousResponsePlaybookRun document
  step: any;   // PlaybookStepTemplate embedded doc
  trigger: any; // AutonomousResponseTrigger document (for context)
}): Promise<PlaybookStepResult> {
  await connectToDatabase();

  const stepRunKey = `${input.run.runKey}::s${input.step.stepOrder}`;

  // Before snapshot
  const latestSnapshot = await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any;
  const beforeSnapshot  = latestSnapshot?.systemHealth ?? {};

  // Create step run record
  await AutonomousResponsePlaybookStepRun.create({
    stepRunKey,
    runKey:      input.run.runKey,
    playbookKey: input.run.playbookKey,
    stepKey:     input.step.stepKey,
    stepOrder:   input.step.stepOrder,
    actionType:  input.step.actionType,
    responseClass: input.step.responseClass,
    riskBand:    input.step.riskBand,
    status:      'planned',
    beforeSnapshot,
  });

  // Pre-dispatch abort check: operator freeze?
  const globalFreeze = await AutonomousResponsePolicy.findOne({ policyKey: 'global_freeze' }).lean() as any;
  const operatorFreeze = globalFreeze?.enabled === false;

  const abortCheck = evaluatePlaybookAbort({
    retryCount:     0,
    maxRetries:     input.step.maxRetries ?? 0,
    operatorFreeze,
    governanceBlocked: false,
  });

  if (abortCheck.abort) {
    await AutonomousResponsePlaybookStepRun.updateOne({ stepRunKey }, { $set: { status: 'aborted', executionSummary: { abortReason: abortCheck.reason } } });
    return { stepRunKey, traceId: null, status: 'aborted', governedVerdict: 'block', beforeSnapshot, aborted: true, abortReason: abortCheck.reason };
  }

  // Gate check for this step's risk band and response class
  const gateResult = await evaluateAutonomousResponseGate({
    triggerSeverity: input.trigger.severity as any,
    riskBand:        input.step.riskBand as any,
    triggerType:     input.trigger.triggerType,
  });

  // If approval required and step risk is high → mark waiting, don't dispatch
  if (gateResult.verdict === 'block') {
    await AutonomousResponsePlaybookStepRun.updateOne({ stepRunKey }, { $set: { status: 'aborted', executionSummary: { abortReason: 'Gate blocked' } } });
    return { stepRunKey, traceId: null, status: 'blocked', governedVerdict: 'block', beforeSnapshot, aborted: true, abortReason: 'Gate blocked step' };
  }

  if (gateResult.verdict === 'approval_required' && RISK_ORDER[input.step.riskBand as keyof typeof RISK_ORDER] >= RISK_ORDER.medium) {
    await AutonomousResponsePlaybookStepRun.updateOne({ stepRunKey }, { $set: { status: 'waiting_checkpoint', executionSummary: { reason: 'Awaiting approval' } } });
    return { stepRunKey, traceId: null, status: 'waiting_checkpoint', governedVerdict: 'approval_required', beforeSnapshot, aborted: false, abortReason: '' };
  }

  // ── Dispatch through governed path ─────────────────────────────────────
  await AutonomousResponsePlaybookStepRun.updateOne({ stepRunKey }, { $set: { status: 'submitted' } });

  const dispatchResult = await dispatchAutonomousResponse({
    trigger: input.trigger,
    responsePlan: {
      responseAction: input.step.actionType,
      responseClass:  gateResult.responseClass,
      riskBand:       input.step.riskBand,
      rationale:      `Playbook step ${input.step.stepOrder}/${input.step.stepKey} — ${input.run.playbookKey}`,
    },
    gateResult,
  });

  const stepStatus = dispatchResult.executionStatus === 'blocked' ? 'aborted'
                   : dispatchResult.executionStatus === 'planned'  ? 'waiting_checkpoint'
                   : 'executed';

  await AutonomousResponsePlaybookStepRun.updateOne({ stepRunKey }, {
    $set: { status: stepStatus, traceId: dispatchResult.traceId, executionSummary: dispatchResult },
  });

  return {
    stepRunKey,
    traceId:         dispatchResult.traceId,
    status:          stepStatus,
    governedVerdict: dispatchResult.governanceVerdict,
    beforeSnapshot,
    aborted:         stepStatus === 'aborted',
    abortReason:     stepStatus === 'aborted' ? (dispatchResult.executionStatus ?? '') : '',
  };
}

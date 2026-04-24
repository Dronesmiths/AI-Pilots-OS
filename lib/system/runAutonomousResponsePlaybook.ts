/**
 * lib/system/runAutonomousResponsePlaybook.ts
 *
 * Full playbook state machine orchestrator.
 *
 * Flow per step:
 *   1. Check abort conditions (freeze, harm, risk spike)
 *   2. Check escalation conditions (checkpoint fail, risk ceiling)
 *   3. Dispatch step through governed path (runPlaybookStep → dispatchAutonomousResponse)
 *   4. Evaluate checkpoint (if configured)
 *   5. Branch: next_step | retry | abort | escalate | complete
 *   6. Update run record at each branch point
 *
 * ENV: PLAYBOOK_CHECKPOINT_DELAY_MS=2000 (ms between step and checkpoint, default 2s)
 * In production, replace with job scheduler for async checkpoints.
 */
import connectToDatabase              from '@/lib/mongodb';
import MetaGovernorSnapshot           from '@/models/system/MetaGovernorSnapshot';
import AutonomousResponsePlaybookRun  from '@/models/system/AutonomousResponsePlaybookRun';
import AutonomousResponsePlaybookStepRun from '@/models/system/AutonomousResponsePlaybookStepRun';
import AutonomousResponsePolicy       from '@/models/system/AutonomousResponsePolicy';
import { runPlaybookStep }            from './runPlaybookStep';
import { evaluatePlaybookCheckpoint } from './evaluatePlaybookCheckpoint';
import { evaluatePlaybookAbort }      from './evaluatePlaybookCheckpoint';
import { evaluatePlaybookEscalation } from './evaluatePlaybookCheckpoint';

const CHECKPOINT_DELAY = parseInt(process.env.PLAYBOOK_CHECKPOINT_DELAY_MS ?? '2000', 10);
const RISK_ORDER = { low: 1, medium: 2, high: 3 } as const;

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function runAutonomousResponsePlaybook(input: {
  trigger:  any;
  playbook: any;
  campaignKey?: string;
}): Promise<{ runKey: string; status: string; stepResults: any[]; escalationLevel: string }> {
  await connectToDatabase();

  const { trigger, playbook, campaignKey } = input;
  const runKey = `${trigger.triggerKey}::pb::${Date.now()}`;

  // Capture before snapshot
  const beforeSnapshot = (await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any)?.systemHealth ?? {};

  // Create run record
  await AutonomousResponsePlaybookRun.create({
    runKey,
    triggerKey:       trigger.triggerKey,
    playbookKey:      playbook.playbookKey,
    tenantId:         trigger.tenantId ?? null,
    scopeKey:         trigger.scopeKey ?? null,
    campaignKey:      campaignKey ?? null,
    status:           'running',
    currentStepOrder: 0,
    beforeSnapshot,
  });

  const steps = (playbook.steps ?? []).sort((a: any, b: any) => a.stepOrder - b.stepOrder);
  const stepResults: any[] = [];
  let currentEscalation: string = 'none';
  let retryCount = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Update run location
    await AutonomousResponsePlaybookRun.updateOne({ runKey }, {
      $set: { currentStepOrder: step.stepOrder, currentStepKey: step.stepKey, status: 'running' },
    });

    // Pre-step abort check
    const freeze = await AutonomousResponsePolicy.findOne({ policyKey: 'global_freeze' }).lean() as any;
    const abort = evaluatePlaybookAbort({
      retryCount, maxRetries: step.maxRetries ?? 0,
      operatorFreeze:    freeze?.enabled === false,
      governanceBlocked: false,
    });

    if (abort.abort) {
      await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'aborted', abortReason: abort.reason } });
      return { runKey, status: 'aborted', stepResults, escalationLevel: currentEscalation };
    }

    // Pre-step escalation check for next step risk band ceiling
    const nextStep = steps[i + 1] as any | undefined;
    const escalationCheck = evaluatePlaybookEscalation({
      triggerSeverity:   trigger.severity,
      checkpointPassed:  true,  // pre-step: optimistic
      retryCount:        retryCount,
      nextStepRiskBand:  step.riskBand as any,
      maxAutoRiskBand:   playbook.maxTotalRiskBand ?? 'medium',
      currentEscalation: currentEscalation as any,
    });

    if (escalationCheck.escalate) {
      const newLevel = escalationCheck.level;
      if (newLevel === 'emergency' || newLevel === 'operator_review') {
        await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'escalated', escalationLevel: newLevel, abortReason: escalationCheck.reason } });
        return { runKey, status: 'escalated', stepResults, escalationLevel: newLevel };
      }
      currentEscalation = newLevel;
      await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { escalationLevel: newLevel } });
    }

    // Execute step through governed path
    const stepResult = await runPlaybookStep({ run: { runKey, playbookKey: playbook.playbookKey }, step, trigger });
    stepResults.push({ stepKey: step.stepKey, stepOrder: step.stepOrder, ...stepResult });

    if (stepResult.aborted) {
      await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'aborted', abortReason: stepResult.abortReason } });
      return { runKey, status: 'aborted', stepResults, escalationLevel: currentEscalation };
    }

    // Checkpoint evaluation
    if (step.checkpointType !== 'none') {
      await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'waiting_checkpoint' } });
      await delay(CHECKPOINT_DELAY);

      const afterSnapshot = (await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any)?.systemHealth ?? {};
      await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { afterSnapshot } });

      const checkpoint = evaluatePlaybookCheckpoint({
        checkpointType:   step.checkpointType,
        checkpointConfig: step.checkpointConfig ?? {},
        beforeSnapshot:   stepResult.beforeSnapshot,
        afterSnapshot,
      });

      // Update step run with checkpoint result
      await AutonomousResponsePlaybookStepRun.updateOne({ stepRunKey: stepResult.stepRunKey }, {
        $set: { checkpointResult: checkpoint, afterSnapshot, status: checkpoint.passed ? 'passed' : 'failed' },
      });

      if (!checkpoint.passed) {
        // Abort check based on harm
        const afterAbort = evaluatePlaybookAbort({
          retryCount, maxRetries: step.maxRetries ?? 0,
          rollbackScoreBefore: stepResult.beforeSnapshot?.rollbackScore,
          rollbackScoreAfter:  afterSnapshot.rollbackScore,
          operatorFreeze: false, governanceBlocked: false,
        });
        if (afterAbort.abort) {
          await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'aborted', abortReason: afterAbort.reason } });
          return { runKey, status: 'aborted', stepResults, escalationLevel: currentEscalation };
        }

        // Escalation after checkpoint fail
        const postEscalation = evaluatePlaybookEscalation({
          triggerSeverity:  trigger.severity,
          checkpointPassed: false,
          retryCount,
          nextStepRiskBand: nextStep?.riskBand as any,
          maxAutoRiskBand:  playbook.maxTotalRiskBand ?? 'medium',
          currentEscalation: currentEscalation as any,
        });

        if (postEscalation.escalate) {
          currentEscalation = postEscalation.level;
          await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { escalationLevel: currentEscalation } });

          if (step.onFailure === 'abort' || postEscalation.level === 'emergency') {
            await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'escalated', abortReason: postEscalation.reason } });
            return { runKey, status: 'escalated', stepResults, escalationLevel: currentEscalation };
          }
        }

        // Retry logic
        if (step.onFailure === 'retry' && retryCount < (step.maxRetries ?? 0)) {
          retryCount++;
          i--; // re-run same step
          continue;
        }

        if (step.onFailure === 'escalate') {
          await AutonomousResponsePlaybookRun.updateOne({ runKey }, { $set: { status: 'escalated', escalationLevel: currentEscalation || 'approval_required' } });
          return { runKey, status: 'escalated', stepResults, escalationLevel: currentEscalation || 'approval_required' };
        }
      } else {
        retryCount = 0; // reset retry counter on success
        if (step.onSuccess === 'complete') break;
      }
    } else {
      retryCount = 0;
      if (step.onSuccess === 'complete') break;
    }
  }

  // Completion
  const finalSnapshot = (await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any)?.systemHealth ?? {};
  const completionSummary = {
    totalSteps:     steps.length,
    stepsExecuted:  stepResults.length,
    escalationLevel: currentEscalation,
    beforeHealth:   beforeSnapshot.healthScore,
    afterHealth:    finalSnapshot.healthScore,
  };

  await AutonomousResponsePlaybookRun.updateOne({ runKey }, {
    $set: { status: 'completed', afterSnapshot: finalSnapshot, completionSummary, currentStepOrder: steps.length },
  });

  return { runKey, status: 'completed', stepResults, escalationLevel: currentEscalation };
}

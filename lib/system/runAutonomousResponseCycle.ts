/**
 * lib/system/runAutonomousResponseCycle.ts
 *
 * Orchestrates the full autonomous response loop:
 *   1. Load latest MetaGovernorSnapshot (or build fresh)
 *   2. Detect response-worthy triggers from dashboard signals
 *   3. Skip already-open triggers (dedup by triggerType in past 4h)
 *   4. For each new trigger:
 *      a. Persist trigger record
 *      b. Build response candidates
 *      c. Evaluate trust gate (async - checks DB freeze + policy)
 *      d. Select best candidate within gate verdict
 *      e. Dispatch through governed decision path
 *
 * ENV: AUTONOMOUS_RESPONSE_ENABLED=false (default — triggers detected but not dispatched)
 */
import connectToDatabase              from '@/lib/mongodb';
import MetaGovernorSnapshot           from '@/models/system/MetaGovernorSnapshot';
import AutonomousResponseTrigger      from '@/models/system/AutonomousResponseTrigger';
import { buildMetaGovernorSnapshot }  from './buildMetaGovernorSnapshot';
import { detectAutonomousResponseTriggers } from './detectAutonomousResponseTriggers';
import { buildAutonomousResponseCandidates, evaluateAutonomousResponseGate } from './buildAutonomousResponseCandidates';
import { dispatchAutonomousResponse } from './dispatchAutonomousResponse';

const ENABLED = process.env.AUTONOMOUS_RESPONSE_ENABLED === 'true';

export async function runAutonomousResponseCycle(): Promise<{
  triggersDetected: number;
  triggersNew:      number;
  dispatched:       number;
  blocked:          number;
  pendingApproval:  number;
}> {
  await connectToDatabase();

  // 1. Get or build snapshot
  let snapshot = await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any;
  if (!snapshot || Date.now() - new Date(snapshot.createdAt).getTime() > 10 * 60_000) {
    snapshot = await buildMetaGovernorSnapshot();
  }

  // 2. Detect triggers from snapshot signals
  const detected = detectAutonomousResponseTriggers({ dashboard: snapshot });

  // 3. Dedup — skip triggerType that already has an open/planned trigger in past 4h
  const cutoff4h = new Date(Date.now() - 4 * 3_600_000);
  const recentTriggerTypes = new Set(
    (await AutonomousResponseTrigger.find({
      status:    { $in: ['open', 'planned'] },
      createdAt: { $gte: cutoff4h },
    }).lean() as any[]).map(t => t.triggerType)
  );

  const newTriggers = detected.filter(t => !recentTriggerTypes.has(t.triggerType));

  let dispatched = 0, blocked = 0, pendingApproval = 0;

  for (const triggerDesc of newTriggers) {
    const triggerKey = `${triggerDesc.triggerType}::${Date.now()}`;

    const trigger = await AutonomousResponseTrigger.create({
      triggerKey,
      triggerType: triggerDesc.triggerType,
      severity:    triggerDesc.severity,
      metrics:     triggerDesc.metrics,
      scopeKey:    triggerDesc.scopeKey ?? null,
      scopeFamily: triggerDesc.scopeFamily ?? null,
      tenantId:    triggerDesc.tenantId ?? null,
      status:      'open',
    });

    if (!ENABLED) continue; // Detection only — no dispatch until enabled

    // Build candidates
    const candidates = buildAutonomousResponseCandidates({
      triggerType: triggerDesc.triggerType,
      severity:    triggerDesc.severity,
      metrics:     triggerDesc.metrics,
    });
    if (!candidates.length) continue;

    const best = candidates[0];

    // Gate check (async — DB freeze + policy lookup)
    const gateResult = await evaluateAutonomousResponseGate({
      triggerSeverity: triggerDesc.severity,
      riskBand:        best.riskBand,
      triggerType:     triggerDesc.triggerType,
    });

    const responsePlan = {
      responseAction: best.action,
      responseClass:  gateResult.responseClass,
      riskBand:       best.riskBand,
      rationale:      `Auto-detected: ${triggerDesc.triggerType} | severity=${triggerDesc.severity} | gate=${gateResult.reason}`,
    };

    const dispatchResult = await dispatchAutonomousResponse({
      trigger: trigger.toObject(),
      responsePlan,
      gateResult,
    });

    if (dispatchResult.executionStatus === 'blocked')  blocked++;
    else if (dispatchResult.governanceVerdict === 'approval_required') pendingApproval++;
    else dispatched++;
  }

  return {
    triggersDetected: detected.length,
    triggersNew:      newTriggers.length,
    dispatched,
    blocked,
    pendingApproval,
  };
}

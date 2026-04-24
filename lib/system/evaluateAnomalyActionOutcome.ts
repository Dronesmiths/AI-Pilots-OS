/**
 * lib/system/evaluateAnomalyActionOutcome.ts
 *
 * Reads current state ~10+ minutes after action execution.
 * Scores it. Writes a TenantAnomalyActionOutcome doc.
 *
 * Called by the outcome sweep cron (POST /api/mission-control/outcome-sweep).
 * Only runs on actions that:
 *   - are executed (status === 'executed')
 *   - executedAt is >10min ago
 *   - have no outcome yet (no TenantAnomalyActionOutcome with that actionRefId)
 */

import connectToDatabase               from '@/lib/mongodb';
import TenantRuntimeState              from '@/models/TenantRuntimeState';
import TenantLifecycleAnomaly          from '@/models/TenantLifecycleAnomaly';
import TenantLifecycleEvent            from '@/models/TenantLifecycleEvent';
import TenantAnomalyActionOutcome      from '@/models/TenantAnomalyActionOutcome';
import { scoreAnomalyActionEffectiveness } from './scoreAnomalyActionEffectiveness';
import { buildCausalMemoryRecord }     from './buildCausalMemoryRecord';
import { buildActionContextSnapshot }  from './buildActionContextSnapshot';

export async function evaluateAnomalyActionOutcome(action: any): Promise<any> {
  await connectToDatabase();

  // ── Gather current "after" state ─────────────────────────────────────────
  const [runtimeNow, openAnomaly, recoveryCount24h] = await Promise.all([
    TenantRuntimeState.findOne({ tenantId: action.tenantId }).select('state metrics').lean() as Promise<any>,
    TenantLifecycleAnomaly.findOne({
      tenantId: action.tenantId,
      type:     action.anomalyType,
      status:   'open',
    }).lean(),
    TenantLifecycleEvent.countDocuments({
      tenantId:  action.tenantId,
      type:      'recovery_action',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);

  // ── Pull "before" baseline from the anomaly action metadata ──────────────
  const before = {
    healthScore:      action.metadata?.beforeHealthScore      ?? 0,
    runtimeState:     action.metadata?.beforeRuntimeState     ?? 'cold',
    queueDepth:       action.metadata?.beforeQueueDepth       ?? 0,
    recoveryCount24h: action.metadata?.beforeRecoveryCount24h ?? 0,
  };

  const after = {
    healthScore:      0, // health snapshots not yet wired — will update when available
    runtimeState:     (runtimeNow as any)?.state                          ?? 'cold',
    queueDepth:       (runtimeNow as any)?.metrics?.queueDepth            ?? 0,
    recoveryCount24h,
  };

  const scored = scoreAnomalyActionEffectiveness({
    before,
    after,
    anomalyStillOpen: !!openAnomaly,
  });

  const outcomeDoc = await TenantAnomalyActionOutcome.create({
    tenantId:    action.tenantId,
    anomalyType: action.anomalyType,
    actionType:  action.actionType,
    actionRefId: String(action._id),
    mode:        action.autoExecutable ? 'auto' : 'manual',
    before,
    after,
    outcome: { ...scored },
    observedAt: new Date(),
  });

  // ── Write causal memory record (fire-and-forget, never blocks outcome) ──────
  buildActionContextSnapshot(action.tenantId)
    .then(contextSnapshot => buildCausalMemoryRecord({
      tenantId:    action.tenantId,
      anomalyType: action.anomalyType,
      actionType:  action.actionType,
      actionRefId: String(action._id),
      context: {
        ...contextSnapshot,
        // Override with stored before-metadata where more accurate
        runtimeState:     action.metadata?.beforeRuntimeState     ?? contextSnapshot.runtimeState,
        queueDepth:       action.metadata?.beforeQueueDepth       ?? contextSnapshot.queueDepth,
        recoveryCount24h: action.metadata?.beforeRecoveryCount24h ?? contextSnapshot.recoveryCount24h,
        healthScore:      action.metadata?.beforeHealthScore      ?? contextSnapshot.healthScore,
      },
      outcome: {
        anomalyResolved:    scored.anomalyResolved,
        improved:           scored.improved,
        worsened:           scored.worsened,
        effectivenessScore: scored.effectivenessScore,
      },
    }))
    .catch(err => console.error('[evaluateOutcome] causal memory write failed:', err?.message));

  return outcomeDoc;
}

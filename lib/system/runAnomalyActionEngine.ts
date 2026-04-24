/**
 * lib/system/runAnomalyActionEngine.ts
 *
 * Main orchestrator for the anomaly action cycle:
 *   1. Load tenant runtime state + lifecycle history
 *   2. Detect anomalies (pure function)
 *   3. Save recommended actions (deduplicated)
 *   4. Auto-execute bounded actions (autoExecutable=true only)
 *   5. Emit lifecycle events for executed actions
 *   6. Return summary
 *
 * Safe-by-default:
 *   - Only auto-executes when autoExecutable=true
 *   - Non-destructive operations only (inserts + upserts, never deletes)
 *   - Idempotent — safe to call on every supervisor loop or cron
 *
 * Usage:
 *   const summary = await runAnomalyActionEngine(tenantId);
 *   // { detected: 2, saved: 1, executed: ['seed_jobs'], skipped: ['recovery_loop'] }
 */

import connectToDatabase              from '@/lib/mongodb';
import TenantRuntimeState             from '@/models/TenantRuntimeState';
import TenantAnomalyAction            from '@/models/TenantAnomalyAction';
import TenantLifecycleEvent           from '@/models/TenantLifecycleEvent';
import { detectTenantAnomalies }      from './detectTenantAnomalies';
import { saveAnomalyActions }         from './saveAnomalyActions';
import { runAnomalyAction }           from './runAnomalyAction';
import { emitLifecycleEvent }         from './emitLifecycleEvent';
import { getActionExecutionPolicy }   from './getActionExecutionPolicy';
import { getCausalActionHint }        from './getCausalActionHint';

export interface AnomalyEngineSummary {
  tenantId:  string;
  detected:  number;
  saved:     number;
  executed:  string[];
  skipped:   string[];
  errors:    string[];
}

export async function runAnomalyActionEngine(tenantId: string): Promise<AnomalyEngineSummary> {
  await connectToDatabase();

  const summary: AnomalyEngineSummary = {
    tenantId,
    detected: 0,
    saved:    0,
    executed: [],
    skipped:  [],
    errors:   [],
  };

  try {
    // ── 1. Load tenant runtime state ────────────────────────────────────────
    const runtimeDoc = await TenantRuntimeState.findOne({ tenantId }).lean() as any;
    if (!runtimeDoc) return summary; // tenant not yet initialized — skip

    // ── 2. Get lifecycle event counts for pattern detection ─────────────────
    const [degradationCount, recoveryCount] = await Promise.all([
      TenantLifecycleEvent.countDocuments({ tenantId, type: 'degraded' }),
      TenantLifecycleEvent.countDocuments({ tenantId, type: 'recovery_action' }),
    ]);

    // ── 3. Detect anomalies (pure) ──────────────────────────────────────────
    const anomalies = detectTenantAnomalies({
      state:                        runtimeDoc.state,
      activatedAt:                  runtimeDoc.activatedAt,
      warmedAt:                     runtimeDoc.warmedAt,
      degradedAt:                   runtimeDoc.degradedAt,
      jobsProcessedSinceActivation: runtimeDoc.metrics?.jobsProcessedSinceActivation ?? 0,
      failedJobsSinceActivation:    runtimeDoc.metrics?.failedJobsSinceActivation ?? 0,
      pagesPublished:               runtimeDoc.metrics?.pagesPublished ?? 0,
      lastSuccessfulActionAt:       runtimeDoc.metrics?.lastSuccessfulActionAt,
      degradationCount,
      recoveryCount,
    });

    summary.detected = anomalies.length;
    if (!anomalies.length) return summary;

    // ── 4. Save recommended actions (deduplicated) ──────────────────────────
    const newActions = await saveAnomalyActions(tenantId, anomalies);
    summary.saved = newActions.length;

    // ── 5. Auto-execute pending auto-executable actions ─────────────────────
    const pendingActions = await TenantAnomalyAction.find({
      tenantId,
      status:         'pending',
      autoExecutable: true,
    });

    for (const action of pendingActions) {
      // ── Governance check: consult AnomalyActionPolicy before executing ──────
      const policy = await getActionExecutionPolicy(
        action.anomalyType as string,
        action.actionType  as string,
      );

      if (policy.mode === 'disabled') {
        // Policy explicitly disabled this action — mark skipped
        await TenantAnomalyAction.updateOne(
          { _id: action._id },
          { $set: { status: 'skipped', executionNote: 'Disabled by governance policy' } }
        );
        summary.skipped.push(`${action.actionType} (${action.anomalyType}) [policy:disabled]`);
        continue;
      }

      if (policy.mode !== 'auto') {
        // recommend_only or manual_approved — suggestion saved, operator decides
        summary.skipped.push(`${action.actionType} (${action.anomalyType}) [policy:${policy.mode}]`);
        continue;
      }

      // ── Causal hint: ask memory what worked in similar contexts (advisory) ───
      const causalHint = await getCausalActionHint({
        anomalyType:    action.anomalyType as string,
        runtimeState:   runtimeDoc.state,
        queueDepth:     runtimeDoc.metrics?.queueDepth   ?? 0,
        recentFailures: runtimeDoc.metrics?.recentFailures ?? 0,
      }).catch(() => null); // never propagate

      const result = await runAnomalyAction(tenantId, action.actionType as any);

      if (result.success) {
        await TenantAnomalyAction.updateOne(
          { _id: action._id },
          { $set: { status: 'executed', executed: true, executedAt: new Date(), executionNote: result.note } }
        );
        summary.executed.push(`${action.actionType} (${action.anomalyType})`);

        // Emit lifecycle event for executed action — include causal hint if available
        await emitLifecycleEvent({
          tenantId,
          type:    'recovery_action',
          message: `Anomaly action executed: ${action.recommendation}`,
          metadata: {
            actions:     [action.actionType],
            anomalyType: action.anomalyType,
            policyMode:  policy.mode,
            ...(causalHint ? {
              causalHint: {
                suggested:   causalHint.suggestedAction,
                aligned:     causalHint.suggestedAction === action.actionType,
                confidence:  causalHint.confidence,
                sampleCount: causalHint.sampleCount,
              }
            } : {}),
          },
        });
      } else {
        summary.errors.push(`${action.actionType}: ${result.error}`);
      }
    }

    // ── 6. Collect skipped (non-auto-executable) pending actions ────────────
    const skippedActions = await TenantAnomalyAction.find({
      tenantId,
      status:         'pending',
      autoExecutable: false,
    }).lean() as any[];

    summary.skipped = skippedActions.map((a: any) => `${a.actionType} (${a.anomalyType})`);

  } catch (err: any) {
    summary.errors.push(err?.message ?? String(err));
    console.error('[runAnomalyActionEngine] error:', tenantId, err);
  }

  if (summary.executed.length || summary.detected > 0) {
    console.log(JSON.stringify({
      ts: new Date(), action: 'anomaly_engine_run',
      ...summary,
    }));
  }

  return summary;
}

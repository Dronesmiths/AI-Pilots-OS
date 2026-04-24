/**
 * lib/system/runLifecycleIntelligence.ts
 *
 * Orchestrator: analyze → detect → persist anomalies.
 * Uses existing TenantRuntimeState + TenantLifecycleEvent models — no raw DB calls.
 *
 * Called:
 *   - After lifecycle event writes
 *   - After recovery (in fleet-recover cron)
 *   - On Mission Control open (inline in API route)
 */

import connectToDatabase           from '@/lib/mongodb';
import TenantRuntimeState          from '@/models/TenantRuntimeState';
import TenantLifecycleEvent        from '@/models/TenantLifecycleEvent';
import { detectTenantAnomalies }   from './detectTenantAnomalies';
import { saveLifecycleAnomalies }  from './saveLifecycleAnomalies';

export interface LifecycleIntelligenceResult {
  tenantId:     string;
  anomalyCount: number;
  newAnomalies: number;
  resolved:     number;
  anomalies:    any[];
}

export async function runLifecycleIntelligence(tenantId: string): Promise<LifecycleIntelligenceResult> {
  await connectToDatabase();

  // ── 1. Load tenant runtime state ────────────────────────────────────────────
  const runtime = await TenantRuntimeState.findOne({ tenantId }).lean() as any;
  if (!runtime) {
    return { tenantId, anomalyCount: 0, newAnomalies: 0, resolved: 0, anomalies: [] };
  }

  // ── 2. Load lifecycle event counts for pattern detection ──────────────────
  const [degradationCount, recoveryCount] = await Promise.all([
    TenantLifecycleEvent.countDocuments({ tenantId, type: 'degraded' }),
    TenantLifecycleEvent.countDocuments({ tenantId, type: 'recovery_action' }),
  ]);

  // ── 3. Detect anomalies (pure function) ───────────────────────────────────
  const anomalies = detectTenantAnomalies({
    state:                        runtime.state,
    activatedAt:                  runtime.activatedAt,
    warmedAt:                     runtime.warmedAt,
    degradedAt:                   runtime.degradedAt,
    jobsProcessedSinceActivation: runtime.metrics?.jobsProcessedSinceActivation ?? 0,
    failedJobsSinceActivation:    runtime.metrics?.failedJobsSinceActivation ?? 0,
    pagesPublished:               runtime.metrics?.pagesPublished ?? 0,
    lastSuccessfulActionAt:       runtime.metrics?.lastSuccessfulActionAt,
    degradationCount,
    recoveryCount,
  });

  // ── 4. Persist + auto-resolve ──────────────────────────────────────────────
  const newDocs = await saveLifecycleAnomalies(tenantId, anomalies, runtime.state);

  return {
    tenantId,
    anomalyCount: anomalies.length,
    newAnomalies: newDocs.length,
    resolved:     0, // resolved count is embedded in saveLifecycleAnomalies
    anomalies,
  };
}

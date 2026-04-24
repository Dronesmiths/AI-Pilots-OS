/**
 * lib/system/saveLifecycleAnomalies.ts
 *
 * Persists detected lifecycle anomalies to TenantLifecycleAnomaly.
 * Deduplicates: skips if an open anomaly of the same type already exists.
 *
 * Also auto-resolves anomalies whose type is no longer detected
 * (e.g. stuck_cold resolves when the tenant warms up).
 */

import connectToDatabase        from '@/lib/mongodb';
import TenantLifecycleAnomaly  from '@/models/TenantLifecycleAnomaly';
import { type TenantAnomaly }  from './detectTenantAnomalies';

export async function saveLifecycleAnomalies(
  tenantId:  string,
  anomalies: TenantAnomaly[],
  currentRuntimeState?: string,
) {
  await connectToDatabase();

  const detectedTypes = new Set(anomalies.map(a => a.type));

  // ── Auto-resolve anomalies no longer detected ───────────────────────────────
  await TenantLifecycleAnomaly.updateMany(
    {
      tenantId,
      status: 'open',
      type:   { $nin: [...detectedTypes] },
    },
    {
      $set: { status: 'resolved', resolvedAt: new Date() },
    }
  );

  // ── Create new anomaly docs (deduplicated) ───────────────────────────────────
  const created = [];
  for (const anomaly of anomalies) {
    const existing = await TenantLifecycleAnomaly.findOne({
      tenantId,
      type:   anomaly.type,
      status: 'open',
    }).lean();
    if (existing) continue;

    const doc = await TenantLifecycleAnomaly.create({
      tenantId,
      type:     anomaly.type,
      severity: anomaly.severity,
      status:   'open',
      message:  anomaly.description,
      metadata: {
        ...anomaly.data,
        runtimeState: currentRuntimeState,
        lastEventAt:  new Date(),
      },
    });
    created.push(doc);
  }

  return created;
}

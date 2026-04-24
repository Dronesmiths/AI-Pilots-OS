/**
 * lib/system/runTenantRuntimeStateTransition.ts
 *
 * Evaluates metrics → transitions tenant state if needed → writes if changed.
 * Also emits lifecycle events on every real state change.
 * Idempotent — safe to call on every job completion or supervisor loop tick.
 *
 * Returns the (possibly updated) TenantRuntimeState document.
 */

import connectToDatabase            from '@/lib/mongodb';
import TenantRuntimeState           from '@/models/TenantRuntimeState';
import { evaluateTenantRuntimeState, type RuntimeState } from './evaluateTenantRuntimeState';
import { emitLifecycleEvent, type LifecycleEventType }   from './emitLifecycleEvent';

// Map runtime states to their lifecycle event types
const STATE_TO_LIFECYCLE: Partial<Record<RuntimeState, LifecycleEventType>> = {
  warming:  'warming',
  warm:     'warm',
  degraded: 'degraded',
};

export async function runTenantRuntimeStateTransition(tenantId: string) {
  await connectToDatabase();

  // Create cold doc if this tenant hasn't been initialized yet
  let doc = await TenantRuntimeState.findOne({ tenantId });
  if (!doc) {
    doc = await TenantRuntimeState.create({
      tenantId,
      state:       'cold',
      activatedAt: new Date(),
      metrics:     {},
      notes:       ['Tenant runtime state initialized'],
    });
    console.log(JSON.stringify({ ts: new Date(), action: 'tenant_runtime_state_init', tenantId, state: 'cold' }));
    return doc;
  }

  const current = doc.state as RuntimeState;
  const next    = evaluateTenantRuntimeState(doc.metrics as any, current);

  if (next === current) return doc; // no-op — most common path

  const note  = `${new Date().toISOString()} | ${current} → ${next}`;
  const notes = [...(doc.notes ?? []), note].slice(-20);

  const update: Record<string, any> = { state: next, notes };
  if (next === 'warm'     && !doc.warmedAt)  update.warmedAt   = new Date();
  if (next === 'degraded'                  ) update.degradedAt = new Date();

  await TenantRuntimeState.updateOne({ tenantId }, { $set: update });

  console.log(JSON.stringify({
    ts: new Date(), action: 'tenant_runtime_state_transition',
    tenantId, from: current, to: next,
  }));

  // ── Emit lifecycle event for this transition ─────────────────────────────────
  const lifecycleType = STATE_TO_LIFECYCLE[next];
  if (lifecycleType) {
    const isRecovery = current === 'degraded' && next === 'warming';
    await emitLifecycleEvent({
      tenantId,
      type:    isRecovery ? 'recovered' : lifecycleType,
      state:   next,
      message: isRecovery
        ? `Tenant recovered from degraded state → warming`
        : `Tenant transitioned to ${next}`,
      metadata: {
        jobsProcessed: (doc.metrics as any)?.jobsProcessedSinceActivation ?? 0,
      },
    });
  }

  doc.state = next as any;
  return doc;
}

/**
 * lib/onboarding/activateTenant.ts
 *
 * Orchestrates the 5-step tenant activation pipeline.
 * Returns fast (< 3s). No long-running work happens here.
 *
 * Each step is bracketed by updateStep(running) → updateStep(done|error)
 * so the admin UI sees real-time progress via the existing SSE stream.
 *
 * Failure contract:
 *   - Each step is wrapped individually; steps captures exactly what ran
 *   - status='partial' if any step fails — tenant may still be partially usable
 *   - Caller (route) returns 207 for partial, 200 for activated
 */
import type { ActivateTenantInput, ActivateTenantResult } from './types';
import { createTenant }    from './steps/createTenant';
import { initDashboard }   from './steps/initDashboard';
import { provisionEngine } from './steps/provisionEngine';
import { seedQueues }      from './steps/seedQueues';
import { emitActivation }  from './steps/emitActivation';
import { initTimeline, updateStep } from './timeline';

export async function activateTenant(
  input: ActivateTenantInput
): Promise<ActivateTenantResult> {
  const steps: ActivateTenantResult['steps'] = {
    tenant:          'failed',
    dashboard:       'failed',
    engine:          'failed',
    queue:           'failed',
    activationEvent: 'failed',
  };

  let tenantId = '';

  try {
    // ── Step 1 ────────────────────────────────────────────────────────────────
    await updateStep('_pending', 'createTenant', 'running').catch(() => {});
    const tenant = await createTenant(input);
    tenantId     = tenant.tenantId as string;
    steps.tenant = 'created';

    // Initialize timeline now that we have a tenantId
    await initTimeline(tenantId).catch(() => {});
    await updateStep(tenantId, 'createTenant', 'done', 'Tenant record created').catch(() => {});

    // ── Step 2 ────────────────────────────────────────────────────────────────
    await updateStep(tenantId, 'initDashboard', 'running').catch(() => {});
    await initDashboard(tenantId, tenant.domain as string);
    steps.dashboard = 'initialized';
    await updateStep(tenantId, 'initDashboard', 'done', 'Dashboard state initialized').catch(() => {});

    // ── Step 3 ────────────────────────────────────────────────────────────────
    await updateStep(tenantId, 'provisionEngine', 'running').catch(() => {});
    await provisionEngine(tenantId);
    steps.engine = 'provisioned';
    await updateStep(tenantId, 'provisionEngine', 'done', 'Engine provisioned — goals seeded').catch(() => {});

    // ── Step 4 ────────────────────────────────────────────────────────────────
    await updateStep(tenantId, 'seedQueues', 'running').catch(() => {});
    await seedQueues(tenantId);
    steps.queue = 'seeded';
    await updateStep(tenantId, 'seedQueues', 'done', 'Drone queue seeded').catch(() => {});

    // ── Step 5 ────────────────────────────────────────────────────────────────
    await updateStep(tenantId, 'emitActivation', 'running').catch(() => {});
    await emitActivation(tenantId);
    steps.activationEvent = 'emitted';
    await updateStep(tenantId, 'emitActivation', 'done', 'System LIVE — swarm dispatched').catch(() => {});

    return { tenantId, status: 'activated', steps };

  } catch (error: any) {
    // Mark the failed step in the timeline
    const failedStep = getFailedStep(steps);
    if (tenantId && failedStep) {
      await updateStep(tenantId, failedStep as any, 'error', error?.message).catch(() => {});
    }

    return {
      tenantId,
      status:  'partial',
      steps,
      message: error instanceof Error ? error.message : 'Unknown activation error',
    };
  }
}

function getFailedStep(steps: ActivateTenantResult['steps']): string | null {
  if (steps.tenant          === 'failed') return 'createTenant';
  if (steps.dashboard       === 'failed') return 'initDashboard';
  if (steps.engine          === 'failed') return 'provisionEngine';
  if (steps.queue           === 'failed') return 'seedQueues';
  if (steps.activationEvent === 'failed') return 'emitActivation';
  return null;
}

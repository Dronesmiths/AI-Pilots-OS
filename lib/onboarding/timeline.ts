/**
 * lib/onboarding/timeline.ts
 *
 * Helper functions for writing activation step progress.
 * Called from activateTenant() around each step.
 *
 * Also calls emitSystemEvent so the existing SSE stream broadcasts timeline
 * updates to the admin UI — no new SSE endpoint needed.
 */
import connectToDatabase    from '@/lib/mongodb';
import ActivationTimeline   from '@/models/ActivationTimeline';
import { emitSystemEvent }  from '@/lib/events/emitSystemEvent';

export const ACTIVATION_STEPS = [
  'createTenant',
  'initDashboard',
  'provisionEngine',
  'seedQueues',
  'emitActivation',
] as const;

export type ActivationStep = typeof ACTIVATION_STEPS[number];

/** Create the timeline document at the start of activation */
export async function initTimeline(tenantId: string): Promise<string> {
  await connectToDatabase();

  const doc = await ActivationTimeline.create({
    tenantId,
    steps: ACTIVATION_STEPS.map(step => ({ step, status: 'pending' })),
  });

  return String(doc._id);
}

/** Update a single step's status and emit to existing SSE stream */
export async function updateStep(
  tenantId:  string,
  step:      ActivationStep,
  status:    'running' | 'done' | 'error',
  message?:  string,
): Promise<void> {
  await connectToDatabase();

  await ActivationTimeline.updateOne(
    { tenantId, 'steps.step': step },
    {
      $set: {
        'steps.$.status':  status,
        'steps.$.message': message ?? '',
        'steps.$.ts':      new Date(),
      },
    },
    // Update the most recent timeline for this tenant
    { sort: { createdAt: -1 } }
  );

  // Emit to existing SSE stream — admin UI receives timeline_step events
  // via the existing /api/dashboard/stream replay mechanism.
  // No new SSE endpoint required.
  await emitSystemEvent({
    tenantId,
    type:     'timeline_step',
    priority: status === 'error' ? 'high' : 'normal',
    payload:  { step, status, message: message ?? '' },
  }).catch(() => {}); // fire-and-forget — don't block activation on SSE failure
}

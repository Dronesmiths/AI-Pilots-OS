/**
 * lib/onboarding/steps/emitActivation.ts
 *
 * Step 5: Write activation events to the durable event log.
 *
 * Two events:
 *   TENANT_ACTIVATED — system-level signal (picked up by any bus subscriber)
 *   activity_new     — shows in the client dashboard Activity feed via SSE replay
 *
 * Both are written to dashboard_event_logs with sequence numbers,
 * so they appear in the correct order when the client's SSE stream replays.
 * No direct drone calls. No SSE push. Pure durable signal.
 */
import { emitSystemEvent } from '@/lib/events/emitSystemEvent';

export async function emitActivation(tenantId: string) {
  await emitSystemEvent({
    tenantId,
    type:     'TENANT_ACTIVATED',
    priority: 'high',
    payload:  {
      tenantId,
      message: 'Tenant activated and initial jobs seeded',
    },
  });

  await emitSystemEvent({
    tenantId,
    type:     'activity_new',
    priority: 'high',
    payload:  {
      id:        `activation-${tenantId}-${Date.now()}`,
      type:      'activation',
      message:   'Tenant activated. Initial SEO swarm queued.',
      createdAt: new Date().toISOString(),
      status:    'success',
    },
  });
}

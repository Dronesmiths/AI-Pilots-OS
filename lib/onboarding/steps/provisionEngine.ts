/**
 * lib/onboarding/steps/provisionEngine.ts
 *
 * Step 3: Provision the SEO engine state for the tenant.
 *
 * Creates one EngineState record (new clean model, tenantId-keyed).
 * Idempotent via $setOnInsert — status becomes 'ready' immediately.
 */
import connectToDatabase from '@/lib/mongodb';
import EngineState       from '@/models/EngineState';

export async function provisionEngine(tenantId: string) {
  await connectToDatabase();

  return EngineState.findOneAndUpdate(
    { tenantId },
    {
      $setOnInsert: {
        tenantId,
        strategyMode:  'growth',
        banditEnabled: true,
        goals:         ['indexation', 'content_velocity', 'internal_links'],
        status:        'ready',
      },
    },
    { upsert: true, new: true }
  );
}

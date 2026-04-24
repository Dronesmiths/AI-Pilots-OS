/**
 * lib/onboarding/steps/seedQueues.ts
 *
 * Step 4: Seed initial QueueJobs for the drone fleet.
 *
 * Uses the new QueueJob model (tenantId string, simple typed jobs).
 * Lower priority number = higher urgency (drone picks up first).
 *
 * Idempotent: skips job types that already have queued/running entries.
 */
import connectToDatabase from '@/lib/mongodb';
import QueueJob          from '@/models/QueueJob';

const INITIAL_JOBS = [
  { type: 'DISCOVERY',     priority: 10, payload: {} },
  { type: 'STRUCTURE',     priority: 20, payload: {} },
  { type: 'CONTENT_BATCH', priority: 30, payload: { batchSize: 5 } },
  { type: 'INTERNAL_LINK', priority: 40, payload: {} },
];

export async function seedQueues(tenantId: string) {
  await connectToDatabase();

  const existing = await QueueJob.find({
    tenantId,
    type:   { $in: INITIAL_JOBS.map(j => j.type) },
    status: { $in: ['queued', 'running'] },
  }).select('type').lean();

  const existingTypes = new Set(existing.map((j: any) => j.type));
  const toInsert = INITIAL_JOBS
    .filter(j => !existingTypes.has(j.type))
    .map(j => ({ ...j, tenantId, status: 'queued' }));

  if (toInsert.length > 0) {
    await QueueJob.insertMany(toInsert);
  }

  return { inserted: toInsert.length, skipped: INITIAL_JOBS.length - toInsert.length };
}

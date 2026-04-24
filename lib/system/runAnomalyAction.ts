/**
 * lib/system/runAnomalyAction.ts
 *
 * Executes a single anomaly action — bounded, non-destructive, idempotent.
 *
 * Uses mongoose.connection.db for raw collection access (no getMongo()).
 * All operations are upserts or inserts — never deletes.
 *
 * Collection notes:
 *   seoactionjobs     — actual job queue (no underscores — verified in prod)
 *   tenant_settings   — per-tenant concurrency overrides (upserted)
 */

import mongoose               from 'mongoose';
import connectToDatabase      from '@/lib/mongodb';
import { type ActionType }    from './generateAnomalyActions';

export interface ActionResult {
  success:  boolean;
  note?:    string;
  error?:   string;
}

export async function runAnomalyAction(
  tenantId:   string,
  actionType: ActionType,
): Promise<ActionResult> {
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) return { success: false, error: 'No DB connection' };

  try {
    switch (actionType) {

      case 'seed_jobs':
        await db.collection('seoactionjobs').insertOne({
          tenantId,
          type:      'DISCOVERY',
          status:    'queued',
          priority:  10,
          source:    'anomaly_engine',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return { success: true, note: 'Seeded DISCOVERY job' };

      case 'increase_throughput':
        // Inject a REINFORCE job to add queue pressure and drive warming
        await db.collection('seoactionjobs').insertOne({
          tenantId,
          type:      'REINFORCE',
          status:    'queued',
          priority:  15,
          source:    'anomaly_engine',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        // Also bump concurrency cap slightly
        await db.collection('tenant_settings').updateOne(
          { tenantId },
          { $inc: { maxConcurrency: 2 }, $setOnInsert: { tenantId, createdAt: new Date() } },
          { upsert: true }
        );
        return { success: true, note: 'Injected REINFORCE job + bumped concurrency by 2' };

      case 'throttle_system':
        await db.collection('tenant_settings').updateOne(
          { tenantId },
          { $set: { maxConcurrency: 2 }, $setOnInsert: { tenantId, createdAt: new Date() } },
          { upsert: true }
        );
        return { success: true, note: 'Concurrency capped at 2 (throttled)' };

      case 'force_publish':
        await db.collection('seoactionjobs').insertOne({
          tenantId,
          type:      'PUBLISH',
          status:    'queued',
          priority:  5,
          source:    'anomaly_engine',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return { success: true, note: 'Seeded PUBLISH job (priority 5)' };

      case 'inject_activity':
        await db.collection('seoactionjobs').insertOne({
          tenantId,
          type:      'REINFORCE',
          status:    'queued',
          priority:  20,
          source:    'anomaly_engine',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return { success: true, note: 'Injected REINFORCE job (priority 20)' };

      case 'stabilize_system':
        await db.collection('tenant_settings').updateOne(
          { tenantId },
          {
            $set: { stabilizationMode: true, maxConcurrency: 1 },
            $setOnInsert: { tenantId, createdAt: new Date() },
          },
          { upsert: true }
        );
        return { success: true, note: 'Stabilization mode enabled, concurrency=1' };

      default:
        return { success: false, error: `Unknown actionType: ${actionType}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

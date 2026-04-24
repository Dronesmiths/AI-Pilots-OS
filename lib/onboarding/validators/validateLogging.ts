/**
 * lib/onboarding/validators/validateLogging.ts
 *
 * Preflight check: can we write to Mongo?
 *
 * Inserts a single test document into drone_logs and immediately deletes it.
 * Non-destructive. Confirms the Mongo connection is healthy before activation.
 *
 * Uses mongoose.connection.db (consistent with emitSystemEvent — no getMongo()).
 */
import connectToDatabase from '@/lib/mongodb';
import mongoose          from 'mongoose';
import type { PreflightCheckResult } from '../types';

export async function validateLogging(tenantId = 'preflight-test'): Promise<PreflightCheckResult> {
  try {
    await connectToDatabase();
    const db = mongoose.connection.db;
    if (!db) return { ok: false, message: 'Mongo connection not ready' };

    const result = await db.collection('drone_logs').insertOne({
      tenantId,
      type:      'preflight_test',
      message:   'logging connectivity check',
      createdAt: new Date(),
      _ttl:      true, // flag for cleanup
    });

    // Clean up immediately — this is a test doc
    await db.collection('drone_logs').deleteOne({ _id: result.insertedId });

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: `Mongo write failed: ${e?.message ?? 'unknown error'}` };
  }
}

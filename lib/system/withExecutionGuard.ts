/**
 * lib/system/withExecutionGuard.ts
 *
 * Execution Idempotency Guard — exactly-once execution for any async operation.
 *
 * Usage:
 *   const result = await withExecutionGuard('key', () => doExpensiveThingOnce(), 3600000);
 *
 * If key was already executed (status='completed'):
 *   → returns cached result immediately (no re-execution)
 * If key is currently running (status='running'):
 *   → waits up to 30s, then throws (prevents duplicate concurrent execution)
 * If key is new:
 *   → creates 'running' record → executes → stores result → marks 'completed'
 *   → on failure → marks 'failed' (will retry on next call)
 *
 * Use for:
 *   fleet recovery actions (prevent double-healing same tenant)
 *   posture switch executions (prevent duplicate autopilot fires)
 *   content drone runs (prevent duplicate generations)
 *   heartbeat actions with exactly-once semantics
 */
import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import crypto from 'crypto';

// Inline model — lightweight execution record
const ExecutionRecordSchema = new Schema({
  guardKey:      { type: String, required: true, unique: true, index: true },
  status:        { type: String, enum: ['running', 'completed', 'failed'], default: 'running', index: true },
  startedAt:     { type: Date, default: Date.now },
  completedAt:   { type: Date, default: null },
  resultChecksum:{ type: String, default: null },  // SHA-256 of JSON.stringify(result)
  resultSnapshot:{ type: Schema.Types.Mixed, default: null },  // cached result for idempotent return
  expiresAt:     { type: Date, required: true, index: true },   // TTL — purged after this
  errorMessage:  { type: String, default: null },
}, { timestamps: true });

ExecutionRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });  // MongoDB TTL index

const ExecutionRecord: Model<any> = mongoose.models.ExecutionRecord || mongoose.model('ExecutionRecord', ExecutionRecordSchema);

export async function withExecutionGuard<T>(
  key:         string,
  fn:          () => Promise<T>,
  ttlMs:       number = 3_600_000,  // default: 1 hour
  cacheResult: boolean = true
): Promise<T> {
  await connectToDatabase();

  const expiresAt = new Date(Date.now() + ttlMs);

  // Try to claim 'running' status (atomic upsert with createdAt condition)
  let record: any;
  try {
    record = await ExecutionRecord.findOneAndUpdate(
      { guardKey: key, status: { $in: ['failed'] } },  // retry failed
      { guardKey: key, status: 'running', startedAt: new Date(), completedAt: null, resultSnapshot: null, expiresAt, errorMessage: null },
      { upsert: false, new: true }
    );
    if (!record) {
      // Try to find existing
      record = await ExecutionRecord.findOne({ guardKey: key }).lean();
    }
  } catch { record = null; }

  // Already completed — return cached result
  if (record?.status === 'completed' && cacheResult) {
    return record.resultSnapshot as T;
  }

  // Another process is running — wait briefly then proceed (avoid deadlock)
  if (record?.status === 'running' && record.startedAt) {
    const age = Date.now() - new Date(record.startedAt).getTime();
    if (age < 30_000) {
      await new Promise(r => setTimeout(r, 2000));
      const rechk = await ExecutionRecord.findOne({ guardKey: key }).lean() as any;
      if (rechk?.status === 'completed' && cacheResult) return rechk.resultSnapshot as T;
    }
  }

  // Create new running record
  try {
    await ExecutionRecord.findOneAndUpdate(
      { guardKey: key },
      { guardKey: key, status: 'running', startedAt: new Date(), completedAt: null, resultSnapshot: null, expiresAt, errorMessage: null },
      { upsert: true }
    );
  } catch { /* duplicate key on concurrent insert — another process won the race */ }

  try {
    const result = await fn();
    const checksum = crypto.createHash('sha256').update(JSON.stringify(result ?? {})).digest('hex').slice(0, 16);
    await ExecutionRecord.findOneAndUpdate(
      { guardKey: key },
      { status: 'completed', completedAt: new Date(), resultChecksum: checksum, resultSnapshot: cacheResult ? result : null }
    );
    return result;
  } catch (err: any) {
    await ExecutionRecord.findOneAndUpdate({ guardKey: key }, { status: 'failed', errorMessage: err.message ?? String(err) });
    throw err;
  }
}

// Utility: manually mark a guard key as failed (so it can be retried)
export async function resetExecutionGuard(key: string): Promise<void> {
  await connectToDatabase();
  await ExecutionRecord.findOneAndUpdate({ guardKey: key }, { status: 'failed' });
}

// Utility: check status without executing
export async function checkExecutionGuard(key: string): Promise<{ exists: boolean; status?: string; completedAt?: Date; checksum?: string }> {
  await connectToDatabase();
  const rec = await ExecutionRecord.findOne({ guardKey: key }).lean() as any;
  if (!rec) return { exists: false };
  return { exists: true, status: rec.status, completedAt: rec.completedAt, checksum: rec.resultChecksum };
}

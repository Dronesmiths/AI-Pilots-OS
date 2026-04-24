/**
 * lib/system/warmState.ts
 *
 * System Warm State helpers — called by supervisor and drone workers.
 *
 * Usage in supervisor:
 *   import { initWarmState, tickJobCount, checkAndFlipWarm, isSystemWarm } from '@/lib/system/warmState';
 *   await initWarmState();          // on boot
 *   await tickJobCount(5);          // after each worker batch
 *   await checkAndFlipWarm();       // every loop tick — auto-transitions
 *   const warm = await isSystemWarm();
 *
 * Usage in drone workers:
 *   if (!await isSystemWarm()) { limit = COLD_LIMIT; }
 */

import connectToDatabase from '@/lib/mongodb';
import SystemWarmState   from '@/models/SystemWarmState';

const JOB_THRESHOLD    = 50;   // jobs processed since boot to go warm
const TIME_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes uptime to go warm
const ERROR_WINDOW_MS   = 5  * 60 * 1000; // no errors in last 5 min required for time-trigger

let _bootDocId: string | null = null; // module-level cache of current boot doc _id

// ── Initialize on supervisor startup ─────────────────────────────────────────
export async function initWarmState(instanceId?: string): Promise<void> {
  await connectToDatabase();
  const doc = await SystemWarmState.create({
    bootedAt:               new Date(),
    instanceId:             instanceId ?? process.env.HOSTNAME ?? 'local',
    warm:                   false,
    jobsProcessedSinceBoot: 0,
  });
  _bootDocId = String(doc._id);
  console.log(JSON.stringify({ ts: new Date(), action: 'warm_state_init', bootDocId: _bootDocId }));
}

// ── Increment job counter ─────────────────────────────────────────────────────
export async function tickJobCount(count = 1): Promise<void> {
  if (!_bootDocId) return;
  await SystemWarmState.updateOne(
    { _id: _bootDocId },
    { $inc: { jobsProcessedSinceBoot: count }, $set: { lastHealthyAt: new Date() } }
  );
}

// ── Record an error (prevents time-based warm-up if errors are recent) ────────
export async function recordWarmStateError(): Promise<void> {
  if (!_bootDocId) return;
  await SystemWarmState.updateOne(
    { _id: _bootDocId },
    { $set: { criticalErrorAt: new Date() } }
  );
}

// ── Check conditions and flip warm if ready ───────────────────────────────────
export async function checkAndFlipWarm(): Promise<boolean> {
  if (!_bootDocId) return false;
  await connectToDatabase();

  const doc = await SystemWarmState.findById(_bootDocId).lean() as any;
  if (!doc || doc.warm) return true; // already warm

  const now          = Date.now();
  const uptimeMs     = now - new Date(doc.bootedAt).getTime();
  const lastErrorMs  = doc.criticalErrorAt ? now - new Date(doc.criticalErrorAt).getTime() : Infinity;
  const noRecentErr  = lastErrorMs > ERROR_WINDOW_MS;

  let trigger: string | null = null;

  if (doc.jobsProcessedSinceBoot >= JOB_THRESHOLD) {
    trigger = 'job_threshold';
  } else if (uptimeMs >= TIME_THRESHOLD_MS && noRecentErr) {
    trigger = 'time_threshold';
  }

  if (trigger) {
    await SystemWarmState.updateOne(
      { _id: _bootDocId },
      { $set: { warm: true, warmedAt: new Date(), warmTrigger: trigger } }
    );
    console.log(JSON.stringify({
      ts: new Date(), action: 'system_warm',
      trigger, uptimeMinutes: Math.floor(uptimeMs / 60_000),
      jobsProcessed: doc.jobsProcessedSinceBoot,
    }));
    return true;
  }

  return false;
}

// ── Read-only warm check (for drone workers) ──────────────────────────────────
export async function isSystemWarm(): Promise<boolean> {
  // If SAFE_MODE is set, never go warm
  if (process.env.SAFE_MODE === 'true') return false;

  await connectToDatabase();

  // If we have a boot doc, use it
  if (_bootDocId) {
    const doc = await SystemWarmState.findById(_bootDocId).select('warm').lean() as any;
    return !!doc?.warm;
  }

  // Fallback: check most recent boot doc (drone worker context, no initWarmState called)
  const latest = await SystemWarmState.findOne().sort({ bootedAt: -1 }).select('warm').lean() as any;
  return !!latest?.warm;
}

// ── Get full warm state (for API/dashboard) ───────────────────────────────────
export async function getWarmState() {
  await connectToDatabase();
  const doc = _bootDocId
    ? await SystemWarmState.findById(_bootDocId).lean()
    : await SystemWarmState.findOne().sort({ bootedAt: -1 }).lean();
  return doc;
}

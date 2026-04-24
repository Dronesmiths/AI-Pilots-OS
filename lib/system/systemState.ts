/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * lib/system/systemState.ts
 *
 * DB-backed system state manager (not in-memory — survives restarts + multiple instances).
 *
 * Usage in execution paths:
 *   const state = await getSystemState();
 *   if (state.paused) return { skipped: true, reason: 'system paused by operator' };
 */

import connectToDatabase from '@/lib/mongodb';
import SeoSystemState    from '@/models/SeoSystemState';

let _cached: any = null;
let _cachedAt    = 0;
const CACHE_TTL  = 5_000; // 5s cache — avoids a DB hit on every action check

export async function getSystemState(): Promise<{
  paused:         boolean;
  shadowModeOnly: boolean;
  operatorMode:   'simple' | 'advanced';
  pauseReason:    string;
}> {
  await connectToDatabase();

  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL) return _cached;

  const doc = await SeoSystemState.findOneAndUpdate(
    { scopeId: 'global' },
    { $setOnInsert: { scopeId: 'global' } },
    { upsert: true, new: true }
  ).lean() as any;

  _cached   = { paused: doc.paused ?? false, shadowModeOnly: doc.shadowModeOnly ?? false, operatorMode: doc.operatorMode ?? 'advanced', pauseReason: doc.pauseReason ?? '' };
  _cachedAt = now;
  return _cached;
}

export async function pauseSystem({ pausedBy = 'operator', reason = '' } = {}) {
  await connectToDatabase();
  _cached = null; // bust cache
  return SeoSystemState.findOneAndUpdate(
    { scopeId: 'global' },
    { $set: { paused: true, pausedAt: new Date(), pausedBy, pauseReason: reason, lastUpdatedBy: pausedBy } },
    { upsert: true, new: true }
  ).lean();
}

export async function resumeSystem({ resumedBy = 'operator' } = {}) {
  await connectToDatabase();
  _cached = null;
  return SeoSystemState.findOneAndUpdate(
    { scopeId: 'global' },
    { $set: { paused: false, pausedAt: null, pausedBy: '', pauseReason: '', lastUpdatedBy: resumedBy } },
    { upsert: true, new: true }
  ).lean();
}

export async function setShadowOnly(shadowModeOnly: boolean, by = 'operator') {
  await connectToDatabase();
  _cached = null;
  return SeoSystemState.findOneAndUpdate(
    { scopeId: 'global' },
    { $set: { shadowModeOnly, lastUpdatedBy: by } },
    { upsert: true, new: true }
  ).lean();
}

export async function setOperatorMode(mode: 'simple' | 'advanced', by = 'operator') {
  await connectToDatabase();
  _cached = null;
  return SeoSystemState.findOneAndUpdate(
    { scopeId: 'global' },
    { $set: { operatorMode: mode, lastUpdatedBy: by } },
    { upsert: true, new: true }
  ).lean();
}

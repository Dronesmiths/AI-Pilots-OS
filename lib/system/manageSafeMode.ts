/**
 * lib/system/manageSafeMode.ts
 *
 * System Safe Mode — the big red button.
 *
 * Safe mode is a singleton system-wide flag stored in MongoDB.
 * When active, all major Nova subsystems check this flag and degrade gracefully.
 *
 * Safe mode flags:
 *   disableAutopilot       — autopilot will not recommend or execute mode switches
 *   disableSelfEvolution   — self-evolution cycle will not generate or apply proposals
 *   allowManualOnly        — only operator-explicit actions execute (no autonomous decisions)
 *   disableCouncil         — doctrine synthesis council will not run (manual posture only)
 *   disableFederatedLearning — federated prior updates suspended
 *
 * Triggers (auto):
 *   anomaly spike (passed in by anomaly detector)
 *   governance overload
 *   unexpected behavior cluster
 *   immutable guard trigger count > 3 in 1 hour
 *
 * Triggers (manual):
 *   operator POST /api/admin/system/safe-mode { enable: true, reason: ... }
 *
 * Usage in any route/lib:
 *   const mode = await checkSafeMode();
 *   if (mode.active && mode.disableAutopilot) return early;
 */
import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';

const SafeModeSchema = new Schema({
  singletonKey:           { type: String, required: true, unique: true, default: 'system-safe-mode' },
  active:                 { type: Boolean, default: false, index: true },
  reason:                 { type: String, default: '' },
  activatedAt:            { type: Date, default: null },
  activatedBy:            { type: String, default: 'system' },  // 'system' | operator name/id

  // Individual flags — granular control
  disableAutopilot:       { type: Boolean, default: false },
  disableSelfEvolution:   { type: Boolean, default: false },
  allowManualOnly:        { type: Boolean, default: false },
  disableCouncil:         { type: Boolean, default: false },
  disableFederatedLearning:{ type: Boolean, default: false },

  // Auto-trigger counters
  anomalySpikeCount:      { type: Number, default: 0 },
  immutableGuardCount:    { type: Number, default: 0 },
  autoTriggeredCount:     { type: Number, default: 0 },
}, { timestamps: true });

const SystemSafeMode: Model<any> = mongoose.models.SystemSafeMode || mongoose.model('SystemSafeMode', SafeModeSchema);

// ── Read safe mode (fast — always call before any autonomous action) ───────
let _cache: any = null;
let _cacheAt = 0;
const CACHE_MS = 5000;  // 5-second cache to avoid hammering DB on every decision

export async function checkSafeMode(): Promise<{
  active: boolean; reason: string;
  disableAutopilot: boolean; disableSelfEvolution: boolean;
  allowManualOnly: boolean; disableCouncil: boolean; disableFederatedLearning: boolean;
}> {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_MS) return _cache;
  await connectToDatabase();
  const rec = await SystemSafeMode.findOne({ singletonKey: 'system-safe-mode' }).lean() as any;
  const state = rec ?? { active: false, reason: '', disableAutopilot: false, disableSelfEvolution: false, allowManualOnly: false, disableCouncil: false, disableFederatedLearning: false };
  _cache = state; _cacheAt = now;
  return state;
}

// ── Set safe mode (operator or system trigger) ────────────────────────────
export async function setSafeMode(input: {
  active:                  boolean;
  reason:                  string;
  activatedBy?:            string;
  disableAutopilot?:       boolean;
  disableSelfEvolution?:   boolean;
  allowManualOnly?:        boolean;
  disableCouncil?:         boolean;
  disableFederatedLearning?:boolean;
}): Promise<any> {
  await connectToDatabase();
  _cache = null;  // invalidate cache immediately

  const update: any = {
    active:                   input.active,
    reason:                   input.reason,
    activatedBy:              input.activatedBy ?? 'operator',
    activatedAt:              input.active ? new Date() : null,
    disableAutopilot:         input.disableAutopilot         ?? input.active,
    disableSelfEvolution:     input.disableSelfEvolution     ?? input.active,
    allowManualOnly:          input.allowManualOnly           ?? input.active,
    disableCouncil:           input.disableCouncil           ?? false,
    disableFederatedLearning: input.disableFederatedLearning ?? false,
  };

  return SystemSafeMode.findOneAndUpdate({ singletonKey: 'system-safe-mode' }, { $set: update }, { upsert: true, new: true });
}

// ── Auto-trigger: called by anomaly detector, immutable guard, etc. ───────
export async function autoTriggerSafeMode(input: {
  reason:    string;
  trigger:   'anomaly_spike' | 'immutable_guard' | 'governance_overload' | 'unexpected_behavior';
  threshold?:number;  // if trigger count exceeds this, engage full safe mode
}): Promise<{ triggered: boolean; message: string }> {
  await connectToDatabase();
  _cache = null;

  const counterField = input.trigger === 'immutable_guard' ? 'immutableGuardCount' : 'anomalySpikeCount';
  const rec = await SystemSafeMode.findOneAndUpdate(
    { singletonKey: 'system-safe-mode' },
    { $inc: { [counterField]: 1, autoTriggeredCount: 1 } },
    { upsert: true, new: true }
  ) as any;

  const count = rec?.[counterField] ?? 0;
  const threshold = input.threshold ?? 3;

  if (count >= threshold) {
    await setSafeMode({ active: true, reason: `Auto-triggered: ${input.reason} (${count} events)`, activatedBy: 'system', disableAutopilot: true, disableSelfEvolution: true, allowManualOnly: true });
    return { triggered: true, message: `Safe mode activated: ${input.reason}` };
  }

  return { triggered: false, message: `Warning (${count}/${threshold}): ${input.reason}` };
}

// ── Convenience guard: throws if specific flag is set ─────────────────────
export async function assertNotSafeMode(flag: 'disableAutopilot' | 'disableSelfEvolution' | 'allowManualOnly' | 'disableCouncil'): Promise<void> {
  const mode = await checkSafeMode();
  if (mode.active && mode[flag]) {
    throw new Error(`[SafeMode] Operation blocked: ${flag} is active. Reason: ${mode.reason}`);
  }
}

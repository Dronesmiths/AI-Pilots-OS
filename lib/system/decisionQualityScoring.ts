/**
 * lib/system/decisionQualityScoring.ts
 *
 * Decision Quality Scoring — mathematical proof that Nova is improving.
 *
 * DecisionQualityScore = (reward × 0.40) + (stabilityBonus × 0.20)
 *                      − (regret × 0.25) − (harmPenalty × 0.15)
 *
 * Tracked per: tenantId, mode, actionType, time window
 *
 * Exports:
 *   calculateDecisionQualityScore  pure formula
 *   trackDecisionQuality           persists one scored decision
 *   getDecisionQualityTrend        rolling window for before/after comparison
 *   getDecisionQualitySummary      per-tenant/mode breakdown for proof dashboard
 */
import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';

const DecisionQualityRecordSchema = new Schema({
  tenantId:      { type: String, required: true, index: true },
  mode:          { type: String, required: true, index: true },
  actionType:    { type: String, default: 'posture_decision', index: true },

  // Raw inputs
  reward:         { type: Number, default: 0 },    // positive outcome signal (0-1)
  stabilityBonus: { type: Number, default: 0 },    // stability improvement (0-1)
  regret:         { type: Number, default: 0 },    // missed opportunity cost (0-1)
  harmPenalty:    { type: Number, default: 0 },    // harm incurred (0-1)

  // Computed
  qualityScore:  { type: Number, required: true, index: true },  // the final DQS

  windowKey:     { type: String, required: true, index: true },  // 'YYYY-WW' for weekly grouping
  episodeKey:    { type: String, default: null, index: true },   // links back to posture episode
}, { timestamps: true });

DecisionQualityRecordSchema.index({ tenantId: 1, windowKey: 1 });
DecisionQualityRecordSchema.index({ mode: 1, qualityScore: -1 });
DecisionQualityRecordSchema.index({ tenantId: 1, mode: 1, windowKey: 1 });

const DecisionQualityRecord: Model<any> = mongoose.models.DecisionQualityRecord || mongoose.model('DecisionQualityRecord', DecisionQualityRecordSchema);

// ── Week key helper ───────────────────────────────────────────────────────
function weekKey(d: Date = new Date()): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ── Pure scoring formula ──────────────────────────────────────────────────
export function calculateDecisionQualityScore(input: {
  reward:         number;  // 0-1
  stabilityBonus: number;  // 0-1
  regret:         number;  // 0-1
  harmPenalty:    number;  // 0-1
}): number {
  const score = (input.reward * 0.40) + (input.stabilityBonus * 0.20) - (input.regret * 0.25) - (input.harmPenalty * 0.15);
  return +Math.max(-1, Math.min(1, score)).toFixed(4);  // clamped to [-1, 1]
}

// ── Track one decision ────────────────────────────────────────────────────
export async function trackDecisionQuality(input: {
  tenantId:       string;
  mode:           string;
  actionType?:    string;
  reward:         number;
  stabilityBonus: number;
  regret:         number;
  harmPenalty:    number;
  episodeKey?:    string;
}): Promise<number> {
  await connectToDatabase();
  const qualityScore = calculateDecisionQualityScore(input);
  await DecisionQualityRecord.create({
    tenantId:      input.tenantId,
    mode:          input.mode,
    actionType:    input.actionType ?? 'posture_decision',
    reward:        input.reward,
    stabilityBonus:input.stabilityBonus,
    regret:        input.regret,
    harmPenalty:   input.harmPenalty,
    qualityScore,
    windowKey:     weekKey(),
    episodeKey:    input.episodeKey ?? null,
  });
  return qualityScore;
}

// ── Rolling trend (for before/after comparison) ───────────────────────────
export async function getDecisionQualityTrend(input: {
  tenantId:  string;
  windowDays?:number;  // default 30
}): Promise<{ windowKey: string; avgQuality: number; count: number; bestMode: string }[]> {
  await connectToDatabase();
  const since = new Date(Date.now() - (input.windowDays ?? 30) * 86400000);
  const records = await DecisionQualityRecord.find({ tenantId: input.tenantId, createdAt: { $gte: since } }).lean() as any[];

  const byWeek: Record<string, { sum: number; count: number; modes: Record<string, number> }> = {};
  for (const r of records) {
    if (!byWeek[r.windowKey]) byWeek[r.windowKey] = { sum: 0, count: 0, modes: {} };
    byWeek[r.windowKey].sum += r.qualityScore;
    byWeek[r.windowKey].count++;
    byWeek[r.windowKey].modes[r.mode] = (byWeek[r.windowKey].modes[r.mode] ?? 0) + r.qualityScore;
  }

  return Object.entries(byWeek).map(([windowKey, d]) => ({
    windowKey,
    avgQuality: +( d.sum / d.count).toFixed(4),
    count:      d.count,
    bestMode:   Object.entries(d.modes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown',
  })).sort((a, b) => a.windowKey.localeCompare(b.windowKey));
}

// ── Per-mode summary for proof dashboard ──────────────────────────────────
export async function getDecisionQualitySummary(input: {
  tenantId?: string;
  limitDays?: number;
}): Promise<{ mode: string; avgQuality: number; count: number; trend: 'improving' | 'declining' | 'stable' }[]> {
  await connectToDatabase();
  const since = new Date(Date.now() - (input.limitDays ?? 14) * 86400000);
  const query: any = { createdAt: { $gte: since } };
  if (input.tenantId) query.tenantId = input.tenantId;

  const records = await DecisionQualityRecord.find(query).lean() as any[];
  const byMode: Record<string, number[]> = {};
  for (const r of records) { if (!byMode[r.mode]) byMode[r.mode] = []; byMode[r.mode].push(r.qualityScore); }

  return Object.entries(byMode).map(([mode, scores]) => {
    const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
    const half = Math.floor(scores.length / 2);
    const firstHalf = half > 0 ? scores.slice(0, half).reduce((s, n) => s + n, 0) / half : avg;
    const secondHalf= half > 0 ? scores.slice(half).reduce((s, n) => s + n, 0) / (scores.length - half) : avg;
    const trend: 'improving' | 'declining' | 'stable' = secondHalf > firstHalf + 0.02 ? 'improving' : secondHalf < firstHalf - 0.02 ? 'declining' : 'stable';
    return { mode, avgQuality: +avg.toFixed(4), count: scores.length, trend };
  }).sort((a, b) => b.avgQuality - a.avgQuality);
}

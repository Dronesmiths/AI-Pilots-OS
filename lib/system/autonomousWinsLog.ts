/**
 * lib/system/autonomousWinsLog.ts
 *
 * Autonomous Wins Log — the sales weapon.
 *
 * Every time Nova:
 *   prevents a failure
 *   recovers a ranking drop
 *   improves a page
 *   avoids cost
 *   triggers a preemptive action that measurably paid off
 *
 * → Log it with: winType, action, outcome, impact, estimated $ value
 *
 * This feed becomes:
 *   - The proof dashboard (show clients)
 *   - The weekly executive report
 *   - Case study material
 *   - Demo mode data
 *
 * Exports:
 *   logAutonomousWin     call from any action that produces a measurable good outcome
 *   getWinsFeed          recent wins (all tenants or tenant-specific)
 *   getWinsSummary       aggregate stats for proof dashboard header
 */
import mongoose, { Schema, Model } from 'mongoose';
import connectToDatabase from '@/lib/mongodb';

export type WinType =
  | 'failure_prevented'
  | 'ranking_recovered'
  | 'content_improved'
  | 'cost_avoided'
  | 'anomaly_resolved'
  | 'posture_optimized'
  | 'governance_enforced'
  | 'preemptive_action_paid_off';

const AutonomousWinSchema = new Schema({
  tenantId:          { type: String, required: true, index: true },
  winType:           { type: String, required: true, enum: ['failure_prevented','ranking_recovered','content_improved','cost_avoided','anomaly_resolved','posture_optimized','governance_enforced','preemptive_action_paid_off'], index: true },

  action:            { type: String, required: true },             // what Nova did: "Switched to prevention_first"
  outcome:           { type: String, required: true },             // what happened: "Harm rate dropped from 0.18 to 0.04"
  impactDescription: { type: String, default: '' },                // human-readable: "+34% stability gain"
  estimatedDollarValue: { type: Number, default: 0 },              // optional $ value estimate

  // Optional source trace
  mode:              { type: String, default: null },
  episodeKey:        { type: String, default: null, index: true },
  sourceSystem:      { type: String, default: 'nova' },            // 'nova' | 'fleet_recovery' | 'constitution' | etc.

  // Quality score at time of win (for correlation)
  qualityScore:      { type: Number, default: null },
}, { timestamps: true });

AutonomousWinSchema.index({ tenantId: 1, winType: 1, createdAt: -1 });
AutonomousWinSchema.index({ winType: 1, estimatedDollarValue: -1 });

const AutonomousWin: Model<any> = mongoose.models.AutonomousWin || mongoose.model('AutonomousWin', AutonomousWinSchema);

// ── Log a win ─────────────────────────────────────────────────────────────
export async function logAutonomousWin(input: {
  tenantId:             string;
  winType:              WinType;
  action:               string;
  outcome:              string;
  impactDescription?:   string;
  estimatedDollarValue?:number;
  mode?:                string;
  episodeKey?:          string;
  sourceSystem?:        string;
  qualityScore?:        number;
}): Promise<void> {
  await connectToDatabase();
  await AutonomousWin.create({
    tenantId:             input.tenantId,
    winType:              input.winType,
    action:               input.action,
    outcome:              input.outcome,
    impactDescription:    input.impactDescription ?? '',
    estimatedDollarValue: input.estimatedDollarValue ?? 0,
    mode:                 input.mode ?? null,
    episodeKey:           input.episodeKey ?? null,
    sourceSystem:         input.sourceSystem ?? 'nova',
    qualityScore:         input.qualityScore ?? null,
  });
}

// ── Get wins feed ─────────────────────────────────────────────────────────
export async function getWinsFeed(input: {
  tenantId?: string;
  winType?:  WinType;
  limit?:    number;
  since?:    Date;
}): Promise<any[]> {
  await connectToDatabase();
  const query: any = {};
  if (input.tenantId) query.tenantId = input.tenantId;
  if (input.winType)  query.winType  = input.winType;
  if (input.since)    query.createdAt = { $gte: input.since };
  return AutonomousWin.find(query).sort({ createdAt: -1 }).limit(input.limit ?? 20).lean();
}

// ── Get wins summary for proof dashboard ──────────────────────────────────
export async function getWinsSummary(input: {
  tenantId?:  string;
  limitDays?: number;
}): Promise<{
  totalWins:          number;
  totalEstimatedValue:number;
  byWinType:          Record<string, number>;
  topWin:             any | null;
  recentWins:         any[];
  avgDollarPerWin:    number;
}> {
  await connectToDatabase();
  const since = new Date(Date.now() - (input.limitDays ?? 30) * 86400000);
  const query: any = { createdAt: { $gte: since } };
  if (input.tenantId) query.tenantId = input.tenantId;

  const wins = await AutonomousWin.find(query).sort({ createdAt: -1 }).lean() as any[];
  const totalWins = wins.length;
  const totalEstimatedValue = wins.reduce((s: number, w: any) => s + (w.estimatedDollarValue ?? 0), 0);

  const byWinType: Record<string, number> = {};
  for (const w of wins) byWinType[w.winType] = (byWinType[w.winType] ?? 0) + 1;

  const topWin = wins.sort((a, b) => (b.estimatedDollarValue ?? 0) - (a.estimatedDollarValue ?? 0))[0] ?? null;

  return {
    totalWins,
    totalEstimatedValue: +totalEstimatedValue.toFixed(2),
    byWinType,
    topWin,
    recentWins: wins.slice(0, 5),
    avgDollarPerWin: totalWins > 0 ? +(totalEstimatedValue / totalWins).toFixed(2) : 0,
  };
}

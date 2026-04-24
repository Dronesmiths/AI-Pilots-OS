/**
 * lib/system/selectCausalChallengers.ts
 *
 * Context-aware challenger selection using causal memory.
 *
 * For a given anomaly + current tenant context, finds the action types
 * that historically performed best in SIMILAR situations (not just globally).
 *
 * Scoring: 70% effectiveness + 30% context match (scoreCausalContextMatch)
 * Minimum 2 samples per action type to avoid single-tenant noise.
 *
 * Falls back to empty array if insufficient causal memory exists —
 * caller (challenger/start route) falls back to selectChallengers() in that case.
 *
 * Returns ranked candidates ready for challenger experiment creation.
 */

import connectToDatabase              from '@/lib/mongodb';
import AnomalyActionCausalMemory      from '@/models/AnomalyActionCausalMemory';
import { scoreCausalContextMatch }    from './scoreCausalContextMatch';
import type { ContextInput }          from './scoreCausalContextMatch';

export interface CausalChallengerCandidate {
  actionType:        string;
  weightedScore:     number;
  avgEffectiveness:  number;
  avgContextScore:   number;
  samples:           number;
}

const MIN_CAUSAL_SAMPLES    = parseInt(process.env.CAUSAL_CHALLENGER_MIN_SAMPLES ?? '2', 10);
const CAUSAL_MEMORY_LOOKBACK = parseInt(process.env.CAUSAL_MEMORY_LOOKBACK       ?? '200', 10);

export async function selectCausalChallengers(input: {
  anomalyType:       string;
  currentContext:    ContextInput;
  excludeActionType?: string;
  limit?:            number;
}): Promise<CausalChallengerCandidate[]> {
  await connectToDatabase();

  const memories = await AnomalyActionCausalMemory
    .find({ anomalyType: input.anomalyType })
    .sort({ createdAt: -1 })
    .limit(CAUSAL_MEMORY_LOOKBACK)
    .select('actionType outcome.effectivenessScore context')
    .lean() as any[];

  if (memories.length < MIN_CAUSAL_SAMPLES) return []; // caller will fall back

  // Aggregate per action type (weighted score + raw effectiveness + context score)
  const grouped = new Map<string, { effSum: number; ctxSum: number; wSum: number; count: number }>();

  for (const mem of memories) {
    if (input.excludeActionType && mem.actionType === input.excludeActionType) continue;

    const effectiveness = mem.outcome?.effectivenessScore ?? 0;
    const ctxScore      = scoreCausalContextMatch(input.currentContext, mem.context as ContextInput);
    const weighted      = effectiveness * 0.7 + ctxScore * 0.3;

    const entry = grouped.get(mem.actionType) ?? { effSum: 0, ctxSum: 0, wSum: 0, count: 0 };
    entry.effSum += effectiveness;
    entry.ctxSum += ctxScore;
    entry.wSum   += weighted;
    entry.count  += 1;
    grouped.set(mem.actionType, entry);
  }

  return [...grouped.entries()]
    .filter(([, e]) => e.count >= MIN_CAUSAL_SAMPLES)
    .map(([actionType, e]) => ({
      actionType,
      weightedScore:    e.wSum   / e.count,
      avgEffectiveness: e.effSum / e.count,
      avgContextScore:  e.ctxSum / e.count,
      samples:          e.count,
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, input.limit ?? 3);
}

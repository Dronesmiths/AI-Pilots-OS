/**
 * lib/system/findSimilarCausalMemories.ts
 *
 * Cross-tenant similarity lookup: finds causal memories where the tenant was
 * in a similar context (runtimeState + queue band + failure band).
 *
 * Used by getCausalActionHint() to find what worked in similar situations.
 *
 * Band buckets prevent over-matching on exact numbers across different tenants:
 *   queueDepth:    low (<= 5) | medium (6–20) | high (> 20)
 *   recentFailures: low (0–1) | medium (2–5)  | high (> 5)
 */

import connectToDatabase          from '@/lib/mongodb';
import AnomalyActionCausalMemory  from '@/models/AnomalyActionCausalMemory';

export type Band = 'low' | 'medium' | 'high';

export function toQueueBand(depth: number): Band {
  return depth > 20 ? 'high' : depth > 5 ? 'medium' : 'low';
}

export function toFailureBand(failures: number): Band {
  return failures > 5 ? 'high' : failures > 1 ? 'medium' : 'low';
}

export async function findSimilarCausalMemories(input: {
  anomalyType:        string;
  runtimeState:       string;
  queueDepthBand:     Band;
  recentFailuresBand: Band;
  limit?:             number;
}) {
  await connectToDatabase();

  // Fetch recent memories matching anomaly type + runtime state
  // (compound index makes this fast without scanning all memories)
  const docs = await AnomalyActionCausalMemory
    .find({
      anomalyType:             input.anomalyType,
      'context.runtimeState':  input.runtimeState,
    })
    .sort({ createdAt: -1 })
    .limit((input.limit ?? 50) * 3) // over-fetch to account for band filtering
    .lean() as any[];

  // Post-filter to matching bands (can't efficiently index on computed bands)
  return docs.filter((doc: any) => {
    const qBand = toQueueBand(doc.context?.queueDepth   ?? 0);
    const fBand = toFailureBand(doc.context?.recentFailures ?? 0);
    return qBand === input.queueDepthBand && fBand === input.recentFailuresBand;
  }).slice(0, input.limit ?? 50);
}

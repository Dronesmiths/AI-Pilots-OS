/**
 * lib/system/buildCausalMemoryRecord.ts
 *
 * Writes a AnomalyActionCausalMemory doc for a completed action evaluation.
 * Called from evaluateAnomalyActionOutcome() after the outcome is scored.
 *
 * Safe: silently no-ops if a memory for this actionRefId already exists
 * (unique index on actionRefId means duplicate creates return without error).
 */

import connectToDatabase                  from '@/lib/mongodb';
import AnomalyActionCausalMemory          from '@/models/AnomalyActionCausalMemory';
import { inferActionCause }               from './inferActionCause';
import { upsertInterventionMemoryGraph }  from './upsertInterventionMemoryGraph';
import type { ActionContextSnapshot }     from './buildActionContextSnapshot';
import type { CausalOutcome }             from './inferActionCause';

export async function buildCausalMemoryRecord(input: {
  tenantId:    string;
  anomalyType: string;
  actionType:  string;
  actionRefId: string;
  context:     ActionContextSnapshot;
  outcome:     CausalOutcome;
}): Promise<void> {
  await connectToDatabase();

  // Short-circuit if memory already exists (idempotent)
  const existing = await AnomalyActionCausalMemory
    .findOne({ actionRefId: input.actionRefId })
    .select('_id')
    .lean();
  if (existing) return;

  const inferredCause = inferActionCause(input.context, input.outcome, input.actionType);

  await AnomalyActionCausalMemory.create({
    tenantId:    input.tenantId,
    anomalyType: input.anomalyType,
    actionType:  input.actionType,
    actionRefId: input.actionRefId,
    context:     input.context,
    outcome:     input.outcome,
    inferredCause,
  });

  // ── Update intervention memory graph (fire-and-forget) ───────────────────
  upsertInterventionMemoryGraph({
    anomalyType:   input.anomalyType,
    actionType:    input.actionType,
    context:       input.context,
    outcome:       input.outcome,
    inferredCause: { primaryReason: inferredCause.primaryReason },
  }).catch(() => {}); // errors are swallowed inside the function; this is a safety net
}

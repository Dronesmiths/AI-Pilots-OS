/**
 * lib/system/upsertInterventionMemoryGraph.ts
 *
 * For each causal memory record, writes or atomically updates the
 * 5 graph nodes and 4 directed edges that connect them.
 *
 * Node update strategy: $inc running sums + $set derived avg in one operation.
 * Edge update strategy: same pattern — atomic, no race conditions.
 *
 * Called fire-and-forget from buildCausalMemoryRecord.
 * Never throws — always logs and swallows errors.
 */

import connectToDatabase           from '@/lib/mongodb';
import InterventionMemoryNode      from '@/models/InterventionMemoryNode';
import InterventionMemoryEdge      from '@/models/InterventionMemoryEdge';
import { buildContextNodeLabel }   from './buildContextNodeLabel';

interface MemoryInput {
  anomalyType:  string;
  actionType:   string;
  context: {
    runtimeState:   string;
    queueDepth:     number;
    recentFailures: number;
    milestoneCount: number;
  };
  outcome: {
    improved:           boolean;
    worsened:           boolean;
    effectivenessScore: number;
  };
  inferredCause: {
    primaryReason: string;
  };
}

async function upsertNode(
  nodeKey:  string,
  nodeType: string,
  label:    string,
  score:    number,
) {
  // First pass: upsert the doc (creates if new, increments if exists)
  const prev = await InterventionMemoryNode.findOneAndUpdate(
    { nodeKey },
    {
      $setOnInsert: { nodeKey, nodeType, label },
      $inc: {
        'metadata.count':            1,
        'metadata.effectivenessSum': score,
      },
    },
    { upsert: true, new: false } // returns pre-update state
  ) as any;

  // Second pass: recompute avg now that count has been incremented
  const prevCount = prev?.metadata?.count ?? 0;
  const prevSum   = prev?.metadata?.effectivenessSum ?? 0;
  const newAvg    = (prevSum + score) / (prevCount + 1);

  await InterventionMemoryNode.updateOne(
    { nodeKey },
    { $set: { 'metadata.avgEffectiveness': newAvg } }
  );
}

async function upsertEdge(
  edgeKey:  string,
  fromKey:  string,
  toKey:    string,
  edgeType: string,
  score:    number,
  improved: boolean,
  worsened: boolean,
) {
  const successVal  = improved ? 1 : 0;
  const worsenedVal = worsened ? 1 : 0;

  const prev = await InterventionMemoryEdge.findOneAndUpdate(
    { edgeKey },
    {
      $setOnInsert: { edgeKey, fromKey, toKey, edgeType },
      $inc: {
        weight:           1,
        effectivenessSum: score,
        successSum:       successVal,
        worsenedSum:      worsenedVal,
      },
    },
    { upsert: true, new: false }
  ) as any;

  const prevWeight = prev?.weight ?? 0;
  const newWeight  = prevWeight + 1;

  await InterventionMemoryEdge.updateOne(
    { edgeKey },
    {
      $set: {
        avgEffectiveness: ((prev?.effectivenessSum ?? 0) + score)   / newWeight,
        successRate:      ((prev?.successSum       ?? 0) + successVal)   / newWeight,
        worsenedRate:     ((prev?.worsenedSum      ?? 0) + worsenedVal)  / newWeight,
      },
    }
  );
}

export async function upsertInterventionMemoryGraph(memory: MemoryInput): Promise<void> {
  await connectToDatabase();

  try {
    const contextLabel = buildContextNodeLabel(memory.context);
    const outcomeLabel = memory.outcome.worsened ? 'worsened'
                       : memory.outcome.improved ? 'improved' : 'neutral';

    const anomalyKey = `anomaly:${memory.anomalyType}`;
    const contextKey = `context:${contextLabel}`;
    const actionKey  = `action:${memory.actionType}`;
    const outcomeKey = `outcome:${outcomeLabel}`;
    const reasonKey  = `reason:${memory.inferredCause.primaryReason}`;
    const score      = memory.outcome.effectivenessScore;

    // ── Upsert 5 nodes in parallel ────────────────────────────────────────────
    await Promise.all([
      upsertNode(anomalyKey, 'anomaly',  memory.anomalyType,                   score),
      upsertNode(contextKey, 'context',  contextLabel,                          score),
      upsertNode(actionKey,  'action',   memory.actionType,                     score),
      upsertNode(outcomeKey, 'outcome',  outcomeLabel,                          score),
      upsertNode(reasonKey,  'reason',   memory.inferredCause.primaryReason,   score),
    ]);

    // ── Upsert 4 edges in parallel ────────────────────────────────────────────
    await Promise.all([
      upsertEdge(`${anomalyKey}->${contextKey}`, anomalyKey, contextKey, 'anomaly_to_context',  score, memory.outcome.improved, memory.outcome.worsened),
      upsertEdge(`${contextKey}->${actionKey}`,  contextKey, actionKey,  'context_to_action',   score, memory.outcome.improved, memory.outcome.worsened),
      upsertEdge(`${actionKey}->${outcomeKey}`,  actionKey,  outcomeKey, 'action_to_outcome',   score, memory.outcome.improved, memory.outcome.worsened),
      upsertEdge(`${outcomeKey}->${reasonKey}`,  outcomeKey, reasonKey,  'outcome_to_reason',   score, memory.outcome.improved, memory.outcome.worsened),
    ]);

  } catch (err: any) {
    console.error('[upsertInterventionMemoryGraph] error:', err?.message);
  }
}

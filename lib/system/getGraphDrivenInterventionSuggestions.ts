/**
 * lib/system/getGraphDrivenInterventionSuggestions.ts
 *
 * Graph-driven intervention recommendation engine.
 *
 * Traverses the Intervention Memory Graph to find the strongest paths:
 *   anomaly → nearest context → action → outcome → reason
 *
 * DB strategy: bulk $in queries — 6 total queries regardless of graph depth.
 * NOT per-action loops (N+1 avoided).
 *
 * Deduplication: keeps the highest-scoring path per unique actionType.
 *
 * Returns empty array if:
 *   - no context nodes in graph
 *   - no anomaly→context edges
 *   - no context→action edges
 */

import connectToDatabase               from '@/lib/mongodb';
import InterventionMemoryEdge          from '@/models/InterventionMemoryEdge';
import InterventionMemoryNode          from '@/models/InterventionMemoryNode';
import { findBestGraphContextNode }    from './findBestGraphContextNode';
import { scoreGraphInterventionPath }  from './scoreGraphInterventionPath';
import type { ContextInput }           from './scoreCausalContextMatch';

export interface GraphInterventionSuggestion {
  actionType:    string;
  score:         number;
  confidence:    'high' | 'medium' | 'low';
  reason:        string;
  supportingPath: {
    anomaly:  string;
    context:  string;
    action:   string;
    outcome:  string;
    reason:   string;
  };
  metrics: {
    actionAvgEffectiveness: number;
    anomalyToContextWeight: number;
    contextToActionWeight:  number;
    actionToOutcomeWeight:  number;
    successRate:            number;
    worsenedRate:           number;
  };
}

export async function getGraphDrivenInterventionSuggestions(input: {
  anomalyType:    string;
  currentContext: ContextInput;
  limit?:         number;
}): Promise<GraphInterventionSuggestion[]> {
  await connectToDatabase();

  const anomalyKey  = `anomaly:${input.anomalyType}`;
  const limit       = input.limit ?? 5;

  // ── 1. Find nearest context node ─────────────────────────────────────────
  const contextNode = await findBestGraphContextNode(input.currentContext);
  if (!contextNode) return [];

  const contextKey = contextNode.nodeKey;

  // ── 2. Bulk fetch anomaly→context + context→action edges ─────────────────
  const [anomalyToContextEdge, contextToActionEdges] = await Promise.all([
    InterventionMemoryEdge.findOne({ fromKey: anomalyKey, toKey: contextKey, edgeType: 'anomaly_to_context' }).lean() as Promise<any>,
    InterventionMemoryEdge.find({ fromKey: contextKey, edgeType: 'context_to_action' }).lean() as Promise<any[]>,
  ]);

  if (!contextToActionEdges?.length) return [];

  // ── 3. Bulk fetch all action nodes ───────────────────────────────────────
  const actionKeys    = contextToActionEdges.map((e: any) => e.toKey);
  const actionNodes   = await InterventionMemoryNode.find({ nodeKey: { $in: actionKeys }, nodeType: 'action' }).lean() as any[];
  const actionNodeMap = new Map(actionNodes.map((n: any) => [n.nodeKey, n]));

  // ── 4. Bulk fetch all action→outcome edges ────────────────────────────────
  const actionToOutcomeEdges = await InterventionMemoryEdge.find({ fromKey: { $in: actionKeys }, edgeType: 'action_to_outcome' }).lean() as any[];

  // ── 5. Bulk fetch all outcome nodes + outcome→reason edges ───────────────
  const outcomeKeys  = [...new Set(actionToOutcomeEdges.map((e: any) => e.toKey))];
  const [outcomeNodes, outcomeToReasonEdges] = await Promise.all([
    InterventionMemoryNode.find({ nodeKey: { $in: outcomeKeys }, nodeType: 'outcome' }).lean() as Promise<any[]>,
    InterventionMemoryEdge.find({ fromKey: { $in: outcomeKeys }, edgeType: 'outcome_to_reason' }).lean() as Promise<any[]>,
  ]);
  const outcomeNodeMap = new Map(outcomeNodes.map((n: any) => [n.nodeKey, n]));

  // ── 6. Bulk fetch all reason nodes ───────────────────────────────────────
  const reasonKeys  = [...new Set(outcomeToReasonEdges.map((e: any) => e.toKey))];
  const reasonNodes = await InterventionMemoryNode.find({ nodeKey: { $in: reasonKeys }, nodeType: 'reason' }).lean() as any[];
  const reasonNodeMap = new Map(reasonNodes.map((n: any) => [n.nodeKey, n]));

  // ── 7. Build path index maps for O(1) lookup ──────────────────────────────
  const edgesByFrom = new Map<string, any[]>();
  for (const e of [...actionToOutcomeEdges, ...outcomeToReasonEdges]) {
    if (!edgesByFrom.has(e.fromKey)) edgesByFrom.set(e.fromKey, []);
    edgesByFrom.get(e.fromKey)!.push(e);
  }

  // ── 8. Score all paths ────────────────────────────────────────────────────
  const rawSuggestions: GraphInterventionSuggestion[] = [];

  for (const actionEdge of contextToActionEdges) {
    const actionNode = actionNodeMap.get(actionEdge.toKey);
    if (!actionNode) continue;

    const actionOutcomeEdges = edgesByFrom.get(actionNode.nodeKey) ?? [];

    for (const outcomeEdge of actionOutcomeEdges) {
      const outcomeNode = outcomeNodeMap.get(outcomeEdge.toKey);
      if (!outcomeNode) continue;

      const outcomeReasonEdges = edgesByFrom.get(outcomeNode.nodeKey) ?? [];

      for (const reasonEdge of outcomeReasonEdges) {
        const reasonNode = reasonNodeMap.get(reasonEdge.toKey);
        if (!reasonNode) continue;

        const score = scoreGraphInterventionPath({
          contextMatch:           contextNode.matchScore,
          anomalyToContextWeight: anomalyToContextEdge?.weight     ?? 0,
          contextToActionWeight:  actionEdge.weight                 ?? 0,
          actionToOutcomeWeight:  outcomeEdge.weight                ?? 0,
          outcomeToReasonWeight:  reasonEdge.weight                 ?? 0,
          actionAvgEffectiveness: actionNode.metadata?.avgEffectiveness ?? 0,
          actionSuccessRate:      outcomeEdge.successRate           ?? 0,
          actionWorsenedRate:     outcomeEdge.worsenedRate          ?? 0,
          outcomeLabel:           outcomeNode.label,
        });

        rawSuggestions.push({
          actionType: actionNode.label,
          score,
          confidence: score >= 80 ? 'high' : score >= 55 ? 'medium' : 'low',
          reason:     reasonNode.label,
          supportingPath: {
            anomaly: input.anomalyType,
            context: contextNode.label,
            action:  actionNode.label,
            outcome: outcomeNode.label,
            reason:  reasonNode.label,
          },
          metrics: {
            actionAvgEffectiveness: Math.round(actionNode.metadata?.avgEffectiveness ?? 0),
            anomalyToContextWeight: anomalyToContextEdge?.weight  ?? 0,
            contextToActionWeight:  actionEdge.weight              ?? 0,
            actionToOutcomeWeight:  outcomeEdge.weight             ?? 0,
            successRate:            outcomeEdge.successRate        ?? 0,
            worsenedRate:           outcomeEdge.worsenedRate       ?? 0,
          },
        });
      }
    }
  }

  // ── 9. Deduplicate: keep highest-scoring path per unique actionType ────────
  const seen = new Set<string>();
  return rawSuggestions
    .sort((a, b) => b.score - a.score)
    .filter(s => { if (seen.has(s.actionType)) return false; seen.add(s.actionType); return true; })
    .slice(0, limit);
}

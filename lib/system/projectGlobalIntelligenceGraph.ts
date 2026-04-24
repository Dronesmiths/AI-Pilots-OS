/**
 * lib/system/projectGlobalIntelligenceGraph.ts
 *
 * Projection builder — reads operational models and upserts corresponding
 * nodes and edges into the global intelligence graph.
 *
 * This is NOT a source of truth. Real data lives in operational models.
 * The graph is a reasoning projection of that data.
 *
 * Run via: POST /api/admin/global-graph/sync
 *
 * Projection sources:
 *   ScopeActionMarket       → scope + champion + challenger nodes
 *   PlannerDecisionRecord   → planner_decision + action nodes, recommends_action edges
 *   ChampionInfluence       → inherits_from edges
 *   ChampionPromotionCase   → promoted_from / demoted_from edges
 *   ExplorationControlProfile → calibrated_by edges
 *
 * Batch size: GRAPH_PROJECTION_BATCH (default 50 per collection).
 */
import connectToDatabase          from '@/lib/mongodb';
import GlobalIntelligenceNode     from '@/models/GlobalIntelligenceNode';
import GlobalIntelligenceEdge     from '@/models/GlobalIntelligenceEdge';
import ScopeActionMarket          from '@/models/ScopeActionMarket';
import ChampionInfluence          from '@/models/ChampionInfluence';
import ChampionPromotionCase      from '@/models/ChampionPromotionCase';

const BATCH = parseInt(process.env.GRAPH_PROJECTION_BATCH ?? '50', 10);

async function upsertNode(nodeKey: string, nodeType: string, label: string, overrides: object = {}) {
  await GlobalIntelligenceNode.findOneAndUpdate(
    { nodeKey },
    { $set: { nodeType, label, status: 'active', ...overrides }, $inc: { weight: 0 } },
    { upsert: true }
  );
}

async function upsertEdge(fromKey: string, edgeType: string, toKey: string, overrides: object = {}) {
  const edgeKey = `${fromKey}::${edgeType}::${toKey}`;
  await GlobalIntelligenceEdge.findOneAndUpdate(
    { edgeKey },
    { $set: { fromKey, edgeType, toKey, ...overrides }, $inc: { evidenceCount: 1 } },
    { upsert: true }
  );
}

export interface ProjectionResult {
  nodesUpserted: number;
  edgesUpserted: number;
  errors:        number;
}

export async function projectGlobalIntelligenceGraph(): Promise<ProjectionResult> {
  await connectToDatabase();
  const result: ProjectionResult = { nodesUpserted: 0, edgesUpserted: 0, errors: 0 };

  // ── Project from ScopeActionMarket ──────────────────────────────────────────
  const markets = await ScopeActionMarket.find({}).limit(BATCH).lean() as any[];
  for (const market of markets) {
    try {
      // Scope node
      const scopeNodeKey = `scope::${market.scopeKey}`;
      await upsertNode(scopeNodeKey, 'scope', market.scopeKey, {
        scopeKey: market.scopeKey, metadata: { marketStatus: market.marketStatus, totalSamples: market.totalSamples },
      });
      result.nodesUpserted++;

      // Anomaly node
      const anomalyKey = `anomaly::${market.anomalyType}`;
      await upsertNode(anomalyKey, 'anomaly', market.anomalyType);
      await upsertEdge(scopeNodeKey, 'has_anomaly', anomalyKey);
      result.nodesUpserted++; result.edgesUpserted++;

      // Champion node + edge
      if (market.currentChampionAction) {
        const champKey = `champion::${market.currentChampionAction}::${market.scopeKey}`;
        const champStanding = market.actions?.find((a: any) => a.role === 'champion');
        await upsertNode(champKey, 'champion', market.currentChampionAction, {
          scopeKey:   market.scopeKey,
          weight:     champStanding?.winRate    ?? 0,
          confidence: champStanding?.stabilityScore ? champStanding.stabilityScore / 100 : 0,
        });
        await upsertEdge(scopeNodeKey, 'recommends_action', champKey, {
          weight:      champStanding?.winRate  ?? 0,
          successRate: champStanding?.winRate  ?? 0,
          harmRate:    champStanding?.harmRate ?? 0,
        });
        result.nodesUpserted++; result.edgesUpserted++;
      }

      // Challenger nodes
      for (const a of (market.actions ?? []).filter((x: any) => x.role === 'challenger')) {
        const challKey = `challenger::${a.actionType}::${market.scopeKey}`;
        await upsertNode(challKey, 'challenger', a.actionType, { scopeKey: market.scopeKey, weight: a.promotionScore ?? 0 });
        result.nodesUpserted++;
      }
    } catch { result.errors++; }
  }

  // ── Project from ChampionInfluence (topology inheritance edges) ──────────────
  const influences = await ChampionInfluence.find({ driftDetected: false }).limit(BATCH).lean() as any[];
  for (const inf of influences) {
    try {
      const fromKey = `scope::${inf.sourceScope}`;
      const toKey   = `scope::${inf.targetScope}`;
      await upsertEdge(fromKey, 'inherits_from', toKey, {
        weight:     inf.influenceWeight ?? 0,
        confidence: inf.confidence      ?? 0,
        metadata:   { actionType: inf.actionType, similarityScore: inf.similarityScore },
      });
      result.edgesUpserted++;
    } catch { result.errors++; }
  }

  // ── Project from ChampionPromotionCase (promotion history edges) ─────────────
  const cases = await ChampionPromotionCase.find({ resolved: true, caseType: 'promotion' }).limit(BATCH).lean() as any[];
  for (const c of cases) {
    try {
      if (!c.targetAction || !c.currentChampionAction) continue;
      const challKey = `challenger::${c.targetAction}::${c.scopeKey}`;
      const champKey = `champion::${c.currentChampionAction}::${c.scopeKey}`;
      await upsertEdge(challKey, 'promoted_from', champKey, { confidence: c.decisionConfidence ?? 0 });
      result.edgesUpserted++;
    } catch { result.errors++; }
  }

  return result;
}

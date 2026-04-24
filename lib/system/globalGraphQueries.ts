/**
 * lib/system/globalGraphQueries.ts
 *
 * Graph query functions for the global intelligence reasoning layer.
 * All queries are read-only — they do not modify graph state.
 *
 * Exported functions:
 *   findNearestGlobalActionPatterns   — cross-scope action evidence for a scope
 *   findStrongestGlobalChampions      — actions dominating multiple scopes
 *   findDriftPropagationRegions       — scopes with active drift markers
 *   findLockedScopesAtRisk            — locked scopes with decay/drift signals
 *   findActiveGraphPolicyRules        — rules matching a given scope selector
 */
import connectToDatabase   from '@/lib/mongodb';
import GlobalIntelligenceNode from '@/models/GlobalIntelligenceNode';
import GlobalIntelligenceEdge from '@/models/GlobalIntelligenceEdge';
import GraphPolicyRule        from '@/models/GraphPolicyRule';
import ScopeActionMarket      from '@/models/ScopeActionMarket';

// ── Find nearest global action patterns for a scope ──────────────────────────
export async function findNearestGlobalActionPatterns(input: {
  anomalyType:    string;
  lifecycleStage: string;
  trustTier:      string;
  policyMode:     string;
}) {
  await connectToDatabase();
  // Find all champion/challenger nodes for the same anomaly type
  const anomalyKey  = `anomaly::${input.anomalyType}`;
  const edges = await GlobalIntelligenceEdge.find({ toKey: anomalyKey, edgeType: 'has_anomaly' }).lean() as any[];
  const scopeKeys = edges.map((e: any) => e.fromKey.replace('scope::', ''));

  if (scopeKeys.length === 0) return [];

  const markets = await ScopeActionMarket.find({ scopeKey: { $in: scopeKeys } }).lean() as any[];

  // Aggregate action performance across matching scopes
  const actionMap = new Map<string, { winRate: number; harmRate: number; count: number }>();
  for (const m of markets) {
    for (const a of (m.actions ?? [])) {
      const existing = actionMap.get(a.actionType) ?? { winRate: 0, harmRate: 0, count: 0 };
      const n = existing.count + 1;
      actionMap.set(a.actionType, {
        winRate:  (existing.winRate  * existing.count + (a.winRate  ?? 0)) / n,
        harmRate: (existing.harmRate * existing.count + (a.harmRate ?? 0)) / n,
        count:    n,
      });
    }
  }

  return [...actionMap.entries()]
    .map(([actionType, stats]) => ({ actionType, ...stats }))
    .filter(a => a.count >= 2)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 10);
}

// ── Find strongest global champions (cross-scope) ─────────────────────────────
export async function findStrongestGlobalChampions(input: { anomalyType?: string; limit?: number }) {
  await connectToDatabase();
  const query: any = { nodeType: 'champion', status: 'active' };
  if (input.anomalyType) query['metadata.anomalyType'] = input.anomalyType;

  const nodes = await GlobalIntelligenceNode.find(query).sort({ weight: -1 }).limit(input.limit ?? 10).lean();
  return nodes;
}

// ── Find scopes with active drift markers ────────────────────────────────────
export async function findDriftPropagationRegions() {
  await connectToDatabase();
  const markets = await ScopeActionMarket.find({
    $or: [{ marketStatus: 'reopened' }, { marketStatus: 'degraded' }],
  }).lean() as any[];
  return markets.map((m: any) => ({
    scopeKey:     m.scopeKey,
    anomalyType:  m.anomalyType,
    marketStatus: m.marketStatus,
    reopenReason: m.reopenReason,
    totalSamples: m.totalSamples,
  }));
}

// ── Find locked scopes at risk (decay + drift) ───────────────────────────────
export async function findLockedScopesAtRisk() {
  await connectToDatabase();
  // Scopes that are locked or soft_locked but have low lock confidence
  const markets = await ScopeActionMarket.find({
    marketStatus: { $in: ['locked', 'soft_locked'] },
    championLockConfidence: { $lt: 0.6 },
  }).lean() as any[];
  return markets;
}

// ── Find active graph policy rules matching a scope selector ─────────────────
export async function findActiveGraphPolicyRules(input: {
  anomalyType:    string;
  lifecycleStage: string;
  trustTier:      string;
  policyMode:     string;
}) {
  await connectToDatabase();
  // Rules with wildcard ('*') or matching value across all selector dimensions
  const rules = await GraphPolicyRule.find({ status: { $in: ['shadow', 'active'] } }).lean() as any[];

  return rules.filter((r: any) => {
    const s = r.scopeSelector ?? {};
    return (
      (s.anomalyType    === '*' || !s.anomalyType    || s.anomalyType    === input.anomalyType)    &&
      (s.lifecycleStage === '*' || !s.lifecycleStage || s.lifecycleStage === input.lifecycleStage) &&
      (s.trustTier      === '*' || !s.trustTier      || s.trustTier      === input.trustTier)      &&
      (s.policyMode     === '*' || !s.policyMode     || s.policyMode     === input.policyMode)
    );
  });
}

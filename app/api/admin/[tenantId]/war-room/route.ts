/**
 * app/api/admin/[tenantId]/war-room/route.ts
 *
 * Tenant-scoped war room API route (Step 5 of multi-tenant migration).
 * Accepts tenantId from URL params, enforces access, scopes all queries.
 *
 * Usage:
 *   GET /api/admin/aipilots/war-room   → data scoped to 'aipilots' tenant
 *   GET /api/admin/platform/war-room   → platform owner cross-tenant view
 *
 * The legacy /api/admin/war-room remains active for backward compat.
 */
import { NextRequest, NextResponse }         from 'next/server';
import connectToDatabase                      from '@/lib/mongodb';
import { getTenantContext, withTenantFilter } from '@/lib/tenancy/getTenantContext';
import { enforceTenantAccess }               from '@/lib/tenancy/enforceTenantAccess';
import { NovaPortfolio }                      from '@/models/enterprise/NovaPortfolio';
import { NovaCapitalAllocation }              from '@/models/enterprise/NovaCapitalAllocation';
import { NovaVenture }                        from '@/models/enterprise/NovaVenture';
import { NovaStrategicResolution }            from '@/models/boardroom/NovaStrategicResolution';
import { NovaScenarioSimulation }             from '@/models/boardroom/NovaScenarioSimulation';
import { NovaDecisionThresholdEvaluation }    from '@/models/boardroom/NovaDecisionThresholdEvaluation';
import { NovaPortfolioVote }                  from '@/models/boardroom/NovaPortfolioVote';
import { NovaBoardMemory }                    from '@/models/boardroom/NovaBoardMemory';
import { NovaAnomalyEvent }                   from '@/models/boardroom/NovaAnomalyEvent';
import { NovaAlertPriority }                  from '@/models/boardroom/NovaAlertPriority';
import { NovaIncident }                       from '@/models/boardroom/NovaIncident';
import { NovaMitigationAction }               from '@/models/boardroom/NovaMitigationAction';
import { NovaDecisionRegret }                 from '@/models/boardroom/NovaDecisionRegret';
import { NovaGuardrailViolation }             from '@/models/boardroom/NovaGuardrailViolation';
import { NovaStrategicModeConfig }            from '@/models/boardroom/NovaStrategicModeConfig';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ tenantId: string }> }
) {
  await connectToDatabase();

  const params = await context.params;
  const { tenantId } = params;
  const ctx = await getTenantContext(req, tenantId);

  // Enforce: operator must have war_room.view for this tenant
  try {
    enforceTenantAccess(ctx, tenantId, 'war_room.view');
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, code: err.code }, { status: 403 });
  }

  const tf = (extra: Record<string, unknown> = {}) => withTenantFilter(ctx, extra);

  const [portfolios, allocations, ventures, resolutions, memories, anomalies, incidents, mitigations, regrets, violations, strategicMode] = await Promise.all([
    NovaPortfolio.find(tf()).lean(),
    NovaCapitalAllocation.find(tf({ status: 'active' })).lean(),
    NovaVenture.find(tf()).lean(),
    NovaStrategicResolution.find(tf()).sort({ updatedAt: -1 }).limit(40).lean(),
    NovaBoardMemory.find(tf({ measured: true })).sort({ updatedAt: -1 }).limit(100).lean(),
    NovaAnomalyEvent.find(tf({ status: { $in: ['open','acknowledged'] } })).sort({ detectedAt: -1 }).lean(),
    NovaIncident.find(tf({ status: { $in: ['open','monitoring'] } })).sort({ createdAt: -1 }).limit(20).lean(),
    NovaMitigationAction.find(tf()).sort({ createdAt: -1 }).limit(25).lean(),
    NovaDecisionRegret.find(tf()).sort({ createdAt: -1 }).limit(30).lean(),
    NovaGuardrailViolation.find(tf()).sort({ createdAt: -1 }).limit(50).lean(),
    NovaStrategicModeConfig.findOne({ modeKey: 'global::mode' }).lean(),
  ]);

  const resolutionKeys = resolutions.map(r => r.resolutionKey);
  const anomalyKeys    = anomalies.map((a: any) => a.anomalyKey);

  const [simulations, thresholds, votes, priorities] = await Promise.all([
    NovaScenarioSimulation.find({ resolutionKey: { $in: resolutionKeys } }).lean(),
    NovaDecisionThresholdEvaluation.find({ resolutionKey: { $in: resolutionKeys } }).lean(),
    NovaPortfolioVote.find({ resolutionKey: { $in: resolutionKeys } }).lean(),
    NovaAlertPriority.find({ anomalyKey: { $in: anomalyKeys } }).lean(),
  ]);

  const simByRes          = Object.fromEntries(simulations.map((s: any) => [s.resolutionKey, s]));
  const threshByRes       = Object.fromEntries(thresholds.map((t: any) => [t.resolutionKey, t]));
  const priorityByAnomaly = Object.fromEntries(priorities.map((p: any) => [p.anomalyKey, p]));
  const ventureByKey      = Object.fromEntries(ventures.map((v: any) => [v.ventureKey, v]));

  const votesByRes: Record<string, any[]> = {};
  for (const v of votes as any[]) { (votesByRes[v.resolutionKey] ??= []).push(v); }

  const allocByPortfolio: Record<string, any[]> = {};
  for (const a of allocations as any[]) { (allocByPortfolio[a.portfolioKey] ??= []).push(a); }

  const enrichedResolutions = (resolutions as any[]).map(r => ({
    ...r,
    scenarioSimulation:  simByRes[r.resolutionKey]  ?? null,
    thresholdEvaluation: threshByRes[r.resolutionKey] ?? null,
    votes:               votesByRes[r.resolutionKey]  ?? [],
  }));

  const totalCapital  = (allocations as any[]).reduce((s, a) => s + Number(a.allocatedAmount ?? 0), 0);
  const ventureMap: Record<string, number> = {};
  for (const a of allocations as any[]) {
    ventureMap[a.ventureKey] = (ventureMap[a.ventureKey] ?? 0) + Number(a.allocatedAmount ?? 0);
  }
  const topVentureShare = Math.max(0, ...Object.values(ventureMap).map(v => v / Math.max(1, totalCapital)), 0);
  const measuredMems    = (memories as any[]).filter(m => m.measured);
  const winRate         = measuredMems.length > 0 ? measuredMems.filter(m => m.outcomeScore > 0).length / measuredMems.length : 0;
  const avgOutcome      = measuredMems.length > 0 ? measuredMems.reduce((s, m) => s + Number(m.outcomeScore), 0) / measuredMems.length : 0;
  const criticalAlerts  = (anomalies as any[]).filter(a => a.severity === 'critical').length;
  const highAlerts      = (anomalies as any[]).filter(a => a.severity === 'high').length;

  return NextResponse.json({
    tenantId:        ctx.tenantId,
    isPlatformOwner: ctx.isPlatformOwner,
    operatorRole:    ctx.role,
    portfolios, allocations, allocByPortfolio, ventures: Object.values(ventureByKey),
    resolutions: enrichedResolutions, memories,
    anomalies: (anomalies as any[]).map(a => ({ ...a, priority: priorityByAnomaly[a.anomalyKey] ?? null })),
    priorityByAnomaly, incidents, mitigations, regrets,
    violations: violations ?? [],
    strategicMode: strategicMode?.mode ?? 'growth',
    stats: {
      totalCapital, ventureCount: Object.keys(ventureMap).length,
      topVentureShare: parseFloat(topVentureShare.toFixed(3)),
      openAnomalies: (anomalies as any[]).length, criticalAlerts,
      pendingResolutions: (resolutions as any[]).filter(r => ['proposed','voting'].includes(r.status)).length,
      blockedResolutions: (resolutions as any[]).filter(r => r.status === 'rejected').length,
      winRate: parseFloat(winRate.toFixed(3)), avgOutcomeScore: parseFloat(avgOutcome.toFixed(3)),
      systemStatus: criticalAlerts > 0 ? 'CRITICAL' : highAlerts > 2 ? 'AT RISK' : 'NOMINAL',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}

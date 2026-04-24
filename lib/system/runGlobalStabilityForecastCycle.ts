/**
 * lib/system/runGlobalStabilityForecastCycle.ts
 *
 * Orchestrates a full forecast cycle:
 *   1. Auto-enumerate targets from live DB state
 *   2. Build feature snapshots for each
 *   3. Compute local risk + graph propagation
 *   4. Compute campaign formation risk across target groups
 *   5. Persist GlobalStabilityForecast
 *   6. Emit predictive triggers for at_risk/critical targets
 *   7. Evaluate expired forecasts (calibration)
 *
 * ENV: FORECAST_HORIZON_MINUTES=360 (6h default)
 *      FORECAST_MAX_TARGETS=50
 */
import connectToDatabase              from '@/lib/mongodb';
import AdaptiveWeightProfile          from '@/models/system/AdaptiveWeightProfile';
import AutonomousResponseTrigger      from '@/models/system/AutonomousResponseTrigger';
import AutonomousResponsePlaybookRun  from '@/models/system/AutonomousResponsePlaybookRun';
import { GlobalStabilityForecast, StabilityForecastEvaluation } from '@/models/system/GlobalStabilityForecast';
import { buildStabilityFeatureSnapshot }  from './buildStabilityFeatureSnapshot';
import { computeStabilityRisk, propagateGraphRisk, computeCampaignFormationRisk, emitPredictiveResponseTrigger, evaluateStabilityForecast } from './computeStabilityRisk';
import { dispatchAutonomousResponse } from './dispatchAutonomousResponse';
import { evaluateAutonomousResponseGate } from './buildAutonomousResponseCandidates';

const HORIZON    = parseInt(process.env.FORECAST_HORIZON_MINUTES ?? '360', 10);
const MAX_TARGETS= parseInt(process.env.FORECAST_MAX_TARGETS    ?? '50',  10);

export async function runGlobalStabilityForecastCycle(): Promise<{
  forecastKey:   string;
  targetsScanned:number;
  atRisk:        number;
  critical:      number;
  triggersEmitted:number;
  evaluationsRun: number;
}> {
  await connectToDatabase();

  // ── 1. Auto-enumerate targets ────────────────────────────────────────
  const targets: Array<{ targetType: any; targetKey: string }> = [];

  // Always include global system state
  targets.push({ targetType: 'scope_family', targetKey: 'global' });

  // Active adaptive weight profile families → scope_family targets
  const profiles = await AdaptiveWeightProfile.find({ status: 'learning' }).limit(20).lean() as any[];
  for (const p of profiles) {
    const family = (p.profileKey as string).split('::')[0];
    if (family && !targets.find(t => t.targetKey === family)) {
      targets.push({ targetType: 'scope_family', targetKey: family });
    }
  }

  // Open triggers with scopeKey → scope targets
  const openTriggers = await AutonomousResponseTrigger.find({ status: { $in: ['open', 'planned'] } }).limit(20).lean() as any[];
  for (const t of openTriggers) {
    if (t.scopeKey && !targets.find(x => x.targetKey === t.scopeKey)) {
      targets.push({ targetType: 'scope', targetKey: t.scopeKey });
    }
  }

  // Escalated playbook runs → campaign_region targets
  const escalated = await AutonomousResponsePlaybookRun.find({ status: 'escalated' }).limit(10).lean() as any[];
  for (const r of escalated) {
    const rKey = r.campaignKey ?? r.playbookKey;
    if (rKey && !targets.find(t => t.targetKey === rKey)) {
      targets.push({ targetType: 'campaign_region', targetKey: rKey });
    }
  }

  const slicedTargets = targets.slice(0, MAX_TARGETS);

  // ── 2. Build features + 3. Compute risk per target ───────────────────
  const forecastTargets: any[] = [];
  const riskScores: number[] = [];

  for (const target of slicedTargets) {
    const snapshot = await buildStabilityFeatureSnapshot({ targetType: target.targetType, targetKey: target.targetKey, horizonMinutes: HORIZON });
    const base     = computeStabilityRisk(snapshot.features);
    const propagated = propagateGraphRisk({
      localRiskScore:        base.riskScore,
      graphNeighborhoodRisk: snapshot.features.graphNeighborhoodRisk,
      similarityWeight:      0.7,
    });

    const forecastState = propagated >= 75 ? 'critical' : propagated >= 50 ? 'at_risk' : propagated >= 28 ? 'watch' : 'stable' as any;

    riskScores.push(propagated);
    forecastTargets.push({
      targetType:           target.targetType,
      targetKey:            target.targetKey,
      forecastType:         'instability_risk',
      riskScore:            propagated,
      confidence:           base.confidence,
      horizonMinutes:       HORIZON,
      forecastState,
      leadingSignals:       base.topFactors,
      contributingFactors:  snapshot.features,
    });
  }

  // ── 4. Campaign formation risk ─────────────────────────────────────
  const campaignRisk = computeCampaignFormationRisk({
    relatedScopeRiskScores: riskScores,
    affectedTenantCount:    openTriggers.filter(t => t.tenantId).length,
    graphClusterDensity:    riskScores.filter(r => r >= 50).length / Math.max(riskScores.length, 1),
  });

  if (campaignRisk.riskScore >= 28) {
    forecastTargets.push({
      targetType: 'campaign_region', targetKey: 'global_cluster',
      forecastType: 'campaign_risk', riskScore: campaignRisk.riskScore,
      confidence: 0.55, horizonMinutes: HORIZON,
      forecastState: campaignRisk.riskScore >= 75 ? 'critical' : campaignRisk.riskScore >= 50 ? 'at_risk' : 'watch',
      leadingSignals: ['relatedScopeRiskScores', 'affectedTenantCount', 'graphClusterDensity'],
      contributingFactors: { campaignRisk: campaignRisk.riskScore },
    });
  }

  // ── 5. Persist forecast ──────────────────────────────────────────────
  const forecastKey = `stability::${Date.now()}`;
  const highRisk    = forecastTargets.filter(t => t.forecastState === 'at_risk').length;
  const crit        = forecastTargets.filter(t => t.forecastState === 'critical').length;

  await GlobalStabilityForecast.create({
    forecastKey, modelVersion: 'v1',
    targets: forecastTargets,
    summary: {
      highRiskTargetCount:  highRisk,
      criticalTargetCount:  crit,
      likelyCampaigns:      campaignRisk.riskScore >= 50 ? 1 : 0,
      likelyPolicyFailures: forecastTargets.filter(t => t.forecastType === 'rollback_risk').length,
    },
  });

  // ── 6. Emit predictive triggers ──────────────────────────────────────
  let triggersEmitted = 0;
  const risky         = forecastTargets.filter(t => t.forecastState === 'at_risk' || t.forecastState === 'critical');

  for (const ft of risky) {
    const descriptor = emitPredictiveResponseTrigger({ forecastState: ft.forecastState, forecastType: ft.forecastType, targetKey: ft.targetKey, riskScore: ft.riskScore, confidence: ft.confidence });
    if (!descriptor) continue;

    const gate = await evaluateAutonomousResponseGate({
      triggerSeverity: ft.forecastState === 'critical' ? 'high' : 'medium',
      riskBand:        'low',
      triggerType:     descriptor.triggerType,
    });

    if (gate.verdict !== 'block') {
      await dispatchAutonomousResponse({
        trigger: { triggerKey: `predictive::${ft.targetKey}::${Date.now()}`, triggerType: descriptor.triggerType, severity: ft.forecastState === 'critical' ? 'high' : 'medium', scopeKey: ft.targetKey, tenantId: null, metrics: descriptor.metrics },
        responsePlan: { responseAction: 'trigger_replay_scan', responseClass: gate.responseClass, riskBand: 'low', rationale: `Predictive: ${descriptor.triggerType} | score=${ft.riskScore.toFixed(1)} | confidence=${(ft.confidence * 100).toFixed(0)}%` },
        gateResult: gate,
      });
      triggersEmitted++;
    }
  }

  // ── 7. Evaluate expired forecasts from previous cycles ───────────────
  let evaluationsRun = 0;
  const expired = await GlobalStabilityForecast.find({
    generatedAt: { $lt: new Date(Date.now() - HORIZON * 60_000) },
    'summary.highRiskTargetCount': { $gt: 0 },
  }).sort({ generatedAt: -1 }).limit(3).lean() as any[];

  for (const old of expired) {
    const alreadyEvaluated = await StabilityForecastEvaluation.countDocuments({ forecastKey: old.forecastKey });
    if (alreadyEvaluated > 0) continue;

    const latest = await GlobalStabilityForecast.findOne().sort({ generatedAt: -1 }).lean() as any;
    if (!latest) continue;

    for (const target of (old.targets ?? []).slice(0, 5)) {
      const latestTarget = (latest.targets ?? []).find((t: any) => t.targetKey === target.targetKey);
      const actual = latestTarget?.forecastState ?? 'stable';
      const eval_ = evaluateStabilityForecast({ predictedRiskScore: target.riskScore, predictedState: target.forecastState, actualState: actual });
      await StabilityForecastEvaluation.create({ forecastKey: old.forecastKey, targetKey: target.targetKey, forecastType: target.forecastType, predictedRiskScore: target.riskScore, predictedState: target.forecastState, actualOutcome: actual, ...eval_ });
      evaluationsRun++;
    }
  }

  return { forecastKey, targetsScanned: slicedTargets.length, atRisk: highRisk, critical: crit, triggersEmitted, evaluationsRun };
}

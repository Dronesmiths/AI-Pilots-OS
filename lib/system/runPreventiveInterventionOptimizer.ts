/**
 * lib/system/runPreventiveInterventionOptimizer.ts
 *
 * Complete preventive optimizer — 5 functions in one file.
 *
 *   buildPreventiveInterventionCandidates   forecast type → action candidates (catalog-enriched)
 *   computePreventiveInterventionCost       weighted cost estimate
 *   computeExpectedPreventionValue          expected risk reduction × evidence
 *   runPreventiveInterventionOptimizer      utility-maximizing chooser (lightest viable)
 *   dispatchPreventiveIntervention          wires chosen action → governed path + DB record
 *   evaluatePreventiveInterventionOutcome   outcome quality for learning loop
 */
import connectToDatabase              from '@/lib/mongodb';
import { PreventiveInterventionCatalog, PreventiveOptimizationProfile, PreventiveInterventionDecision } from '@/models/system/PreventiveIntervention';
import { evaluateAutonomousResponseGate } from './buildAutonomousResponseCandidates';
import { dispatchAutonomousResponse } from './dispatchAutonomousResponse';

const RISK_ORDER = { low: 1, medium: 2, high: 3 } as const;

// ── 1. Build candidates from catalog ─────────────────────────────────────
const FORECAST_ACTION_MAP: Record<string, Array<{ actionType: string; riskBand: 'low' | 'medium' | 'high' }>> = {
  instability_risk:       [{ actionType: 'trigger_replay_scan', riskBand: 'low' }, { actionType: 'increase_self_doubt_shadow', riskBand: 'low' }, { actionType: 'shift_weight_profile_shadow', riskBand: 'medium' }],
  rollback_risk:          [{ actionType: 'stage_shadow_playbook', riskBand: 'low' }, { actionType: 'pause_weight_profile', riskBand: 'medium' }, { actionType: 'rollback_weight_profile', riskBand: 'medium' }],
  champion_decay_risk:    [{ actionType: 'reopen_scope', riskBand: 'low' }, { actionType: 'stage_champion_review', riskBand: 'low' }, { actionType: 'probation_champion', riskBand: 'medium' }],
  campaign_risk:          [{ actionType: 'stage_campaign_observe_mode', riskBand: 'low' }, { actionType: 'reduce_inheritance_shadow', riskBand: 'low' }, { actionType: 'stage_playbook_bundle', riskBand: 'medium' }],
  governance_overload_risk:[{ actionType: 'shift_autonomy_to_shadow', riskBand: 'low' }, { actionType: 'approval_queue_review', riskBand: 'low' }],
  drift_spread_risk:      [{ actionType: 'widen_exploration', riskBand: 'low' }, { actionType: 'trigger_replay_scan', riskBand: 'low' }],
};

export async function buildPreventiveInterventionCandidates(input: {
  forecastType:  string;
  forecastState: 'watch' | 'at_risk' | 'critical';
  targetType:    string;
}): Promise<any[]> {
  await connectToDatabase();
  const base = FORECAST_ACTION_MAP[input.forecastType] ?? [{ actionType: 'trigger_replay_scan', riskBand: 'low' }];

  // Enrich from catalog (adds estimatedCost, priorSuccessRate, etc.)
  const catalogEntries = await PreventiveInterventionCatalog.find({ enabled: true, $or: [
    { compatibleForecastTypes: input.forecastType },
    { compatibleForecastTypes: { $size: 0 } },  // wildcard entries
  ]}).lean() as any[];

  const catalogMap = Object.fromEntries(catalogEntries.map(e => [e.actionType, e]));

  const candidates = base.map(b => ({
    ...b,
    estimatedCost:           catalogMap[b.actionType]?.estimatedCost           ?? 5,
    estimatedDisruption:     catalogMap[b.actionType]?.estimatedDisruption     ?? 3,
    estimatedGovernanceLoad: catalogMap[b.actionType]?.estimatedGovernanceLoad ?? 2,
    actionPriorSuccess:      catalogMap[b.actionType]?.priorSuccessRate        ?? 0.5,
    replaySupport:  0.3,   // default — would come from DecisionReplayLearningEvent query
    graphSupport:   0.3,
  }));

  if (input.forecastState === 'critical') {
    candidates.push({ actionType: 'approval_preventive_containment', riskBand: 'high', estimatedCost: 30, estimatedDisruption: 20, estimatedGovernanceLoad: 25, actionPriorSuccess: 0.7, replaySupport: 0.5, graphSupport: 0.5 });
  }

  return candidates;
}

// ── 2. Cost model ─────────────────────────────────────────────────────────
export function computePreventiveInterventionCost(input: {
  estimatedCost:           number;
  estimatedDisruption:     number;
  estimatedGovernanceLoad: number;
  profile: { costWeight: number; disruptionWeight: number; governanceLoadWeight: number };
}): number {
  return +(
    input.estimatedCost           * input.profile.costWeight           +
    input.estimatedDisruption     * input.profile.disruptionWeight     +
    input.estimatedGovernanceLoad * input.profile.governanceLoadWeight
  ).toFixed(2);
}

// ── 3. Expected prevention value ──────────────────────────────────────────
export function computeExpectedPreventionValue(input: {
  forecastRiskScore:  number;   // 0..100
  actionPriorSuccess: number;   // 0..1
  replaySupport:      number;   // 0..1
  graphSupport:       number;   // 0..1
  confidence?:        number;   // 0..1
}): { expectedRiskReduction: number; confidence: number } {
  const value =
    (input.forecastRiskScore / 100) * 35 +
    input.actionPriorSuccess          * 25 +
    input.replaySupport               * 20 +
    input.graphSupport                * 20;

  return {
    expectedRiskReduction: +value.toFixed(2),
    confidence: +Math.max(0.25, Math.min(0.95, input.confidence ?? 0.6)).toFixed(3),
  };
}

// ── 4. Optimizer ──────────────────────────────────────────────────────────
export function runPreventiveInterventionOptimizer(input: {
  forecast: any;
  candidates: any[];
  profile:    any;
}): { chosen: any; rankings: any[] } {
  const ranked = input.candidates.map(c => {
    const cost  = computePreventiveInterventionCost({ estimatedCost: c.estimatedCost, estimatedDisruption: c.estimatedDisruption, estimatedGovernanceLoad: c.estimatedGovernanceLoad, profile: input.profile });
    const value = computeExpectedPreventionValue({ forecastRiskScore: input.forecast.riskScore, actionPriorSuccess: c.actionPriorSuccess, replaySupport: c.replaySupport, graphSupport: c.graphSupport, confidence: 0.7 });
    // Heavy risk penalty — optimizer strongly prefers lighter actions
    const riskPenalty = c.riskBand === 'high' ? 18 : c.riskBand === 'medium' ? 8 : 0;

    const utility = +(
      value.expectedRiskReduction * (input.profile.preventionValueWeight ?? 1.2) +
      value.confidence            * 20 * (input.profile.confidenceWeight  ?? 1.0) -
      cost - riskPenalty
    ).toFixed(2);

    return { ...c, expectedRiskReduction: value.expectedRiskReduction, confidence: value.confidence, estimatedCostFinal: cost, utility };
  }).sort((a, b) => b.utility - a.utility);

  return { chosen: ranked[0] ?? null, rankings: ranked };
}

// ── 5. Governed dispatcher ────────────────────────────────────────────────
export async function dispatchPreventiveIntervention(input: {
  forecast:          any;   // ForecastTarget from GlobalStabilityForecast
  chosenAction:      any;   // ranked candidate from optimizer
  profile?:          any;   // optimization profile
}): Promise<{ decisionKey: string; submitted: boolean; governanceVerdict: string; traceId: string | null }> {
  await connectToDatabase();

  const decisionKey = `prev::${input.forecast.targetKey}::${Date.now()}`;

  // Gate check
  const gateResult = await evaluateAutonomousResponseGate({
    triggerSeverity: input.forecast.forecastState === 'critical' ? 'high' : input.forecast.forecastState === 'at_risk' ? 'medium' : 'low',
    riskBand:        input.chosenAction.riskBand,
    triggerType:     `predictive_${input.forecast.forecastType}`,
  });

  if (gateResult.verdict === 'block') {
    await PreventiveInterventionDecision.create({ decisionKey, forecastKey: input.forecast.forecastKey ?? '', targetKey: input.forecast.targetKey, forecastType: input.forecast.forecastType, chosenAction: input.chosenAction.actionType, chosenRiskBand: input.chosenAction.riskBand, candidateRankings: [], optimizerSummary: { expectedRiskReduction: input.chosenAction.expectedRiskReduction, expectedCost: input.chosenAction.estimatedCostFinal, confidence: input.chosenAction.confidence }, governanceVerdict: 'block', executionStatus: 'blocked' });
    return { decisionKey, submitted: false, governanceVerdict: 'block', traceId: null };
  }

  // Dispatch through governed path
  const dispatchResult = await dispatchAutonomousResponse({
    trigger: { triggerKey: `prev::${input.forecast.targetKey}::${Date.now()}`, triggerType: `preventive_${input.forecast.forecastType}`, severity: input.forecast.forecastState === 'critical' ? 'high' : 'medium', scopeKey: input.forecast.targetKey, tenantId: null, metrics: { riskScore: input.forecast.riskScore } },
    responsePlan: { responseAction: input.chosenAction.actionType, responseClass: gateResult.responseClass, riskBand: input.chosenAction.riskBand, rationale: `Preventive: ${input.forecast.forecastType} | riskScore=${input.forecast.riskScore?.toFixed(1)} | utility=${input.chosenAction.utility}` },
    gateResult,
  });

  await PreventiveInterventionDecision.create({ decisionKey, forecastKey: input.forecast.forecastKey ?? '', targetKey: input.forecast.targetKey, forecastType: input.forecast.forecastType, chosenAction: input.chosenAction.actionType, chosenRiskBand: input.chosenAction.riskBand, candidateRankings: [], optimizerSummary: { expectedRiskReduction: input.chosenAction.expectedRiskReduction, expectedCost: input.chosenAction.estimatedCostFinal, confidence: input.chosenAction.confidence }, governanceVerdict: gateResult.verdict, executionStatus: dispatchResult.executionStatus, traceId: dispatchResult.traceId });

  return { decisionKey, submitted: true, governanceVerdict: gateResult.verdict, traceId: dispatchResult.traceId };
}

// ── 6. Outcome evaluator ──────────────────────────────────────────────────
export function evaluatePreventiveInterventionOutcome(input: {
  riskScoreBefore:   number;
  riskScoreAfter:    number;
  campaignOccurred:  boolean;
  rollbackOccurred:  boolean;
}): { quality: 'strong_hit' | 'partial_hit' | 'weak_hit' | 'miss' | 'harmful'; delta: number } {
  const delta = input.riskScoreBefore - input.riskScoreAfter;

  const quality =
    delta >= 25 && !input.campaignOccurred && !input.rollbackOccurred ? 'strong_hit' :
    delta >= 10 && !input.rollbackOccurred                            ? 'partial_hit' :
    delta >= 0                                                         ? 'weak_hit'   :
    (input.rollbackOccurred || input.campaignOccurred)                 ? 'miss'       :
    delta < -10                                                        ? 'harmful'    : 'weak_hit';

  return { quality, delta };
}

// ── Catalog seeds ─────────────────────────────────────────────────────────
export const CANONICAL_PREVENTIVE_ACTIONS = [
  { actionKey: 'trigger_replay_scan',         actionType: 'trigger_replay_scan',         actionClass: 'analysis',             defaultRiskBand: 'low',    estimatedCost: 3,  estimatedDisruption: 1,  estimatedGovernanceLoad: 1,  compatibleForecastTypes: ['instability_risk', 'drift_spread_risk'] },
  { actionKey: 'increase_self_doubt_shadow',  actionType: 'increase_self_doubt_shadow',  actionClass: 'weight_shift',         defaultRiskBand: 'low',    estimatedCost: 5,  estimatedDisruption: 2,  estimatedGovernanceLoad: 1,  compatibleForecastTypes: ['instability_risk'] },
  { actionKey: 'shift_weight_profile_shadow', actionType: 'shift_weight_profile_shadow', actionClass: 'weight_shift',         defaultRiskBand: 'medium', estimatedCost: 12, estimatedDisruption: 5,  estimatedGovernanceLoad: 3,  compatibleForecastTypes: ['instability_risk', 'rollback_risk'] },
  { actionKey: 'reopen_scope',                actionType: 'reopen_scope',                actionClass: 'market_adjustment',    defaultRiskBand: 'low',    estimatedCost: 4,  estimatedDisruption: 2,  estimatedGovernanceLoad: 1,  compatibleForecastTypes: ['champion_decay_risk'] },
  { actionKey: 'stage_champion_review',       actionType: 'stage_champion_review',       actionClass: 'market_adjustment',    defaultRiskBand: 'low',    estimatedCost: 5,  estimatedDisruption: 2,  estimatedGovernanceLoad: 2,  compatibleForecastTypes: ['champion_decay_risk'] },
  { actionKey: 'probation_champion',          actionType: 'probation_champion',          actionClass: 'market_adjustment',    defaultRiskBand: 'medium', estimatedCost: 14, estimatedDisruption: 8,  estimatedGovernanceLoad: 4,  compatibleForecastTypes: ['champion_decay_risk'] },
  { actionKey: 'stage_shadow_playbook',       actionType: 'stage_shadow_playbook',       actionClass: 'playbook_stage',       defaultRiskBand: 'low',    estimatedCost: 6,  estimatedDisruption: 2,  estimatedGovernanceLoad: 2,  compatibleForecastTypes: ['rollback_risk'] },
  { actionKey: 'pause_weight_profile',        actionType: 'pause_weight_profile',        actionClass: 'weight_shift',         defaultRiskBand: 'medium', estimatedCost: 15, estimatedDisruption: 8,  estimatedGovernanceLoad: 5,  compatibleForecastTypes: ['rollback_risk'] },
  { actionKey: 'stage_campaign_observe_mode', actionType: 'stage_campaign_observe_mode', actionClass: 'campaign_stage',       defaultRiskBand: 'low',    estimatedCost: 5,  estimatedDisruption: 1,  estimatedGovernanceLoad: 2,  compatibleForecastTypes: ['campaign_risk'] },
  { actionKey: 'reduce_inheritance_shadow',   actionType: 'reduce_inheritance_shadow',   actionClass: 'inheritance_control',  defaultRiskBand: 'low',    estimatedCost: 8,  estimatedDisruption: 4,  estimatedGovernanceLoad: 2,  compatibleForecastTypes: ['campaign_risk'] },
  { actionKey: 'shift_autonomy_to_shadow',    actionType: 'shift_autonomy_to_shadow',    actionClass: 'policy_tune',          defaultRiskBand: 'low',    estimatedCost: 4,  estimatedDisruption: 1,  estimatedGovernanceLoad: 1,  compatibleForecastTypes: ['governance_overload_risk'] },
  { actionKey: 'widen_exploration',           actionType: 'widen_exploration',           actionClass: 'weight_shift',         defaultRiskBand: 'low',    estimatedCost: 5,  estimatedDisruption: 2,  estimatedGovernanceLoad: 1,  compatibleForecastTypes: ['drift_spread_risk'] },
];

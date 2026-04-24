/**
 * lib/system/runModeSimulationSession.ts
 *
 * Complete simulation lab — 6 exports.
 *
 *   CANONICAL_MODE_PROFILES_SIM  (re-exported from operatingModeSystem)
 *   getSimulatedOperatingMode    returns profile for a given mode name (no DB needed)
 *   simulateDecisionUnderMode    applies mode parameters to a real governed decision record
 *   computeModeSimulationEconomics  estimates economics for one simulation
 *   compareModeSimulationResults    ranks modes by economics / safety / governance / prevention
 *   runModeSimulationSession     full orchestrator: queries real history, runs all modes, persists results
 *
 * RULE: Simulation NEVER mutates live state.
 *       All decisions are fictional projections against real inputs.
 *       Source data comes from real GovernedDecisionRecord and GlobalStabilityForecast.
 */
import connectToDatabase               from '@/lib/mongodb';
import GovernedDecisionRecord          from '@/models/system/GovernedDecisionRecord';
import { GlobalStabilityForecast }     from '@/models/system/GlobalStabilityForecast';
import { RecoveryCampaign }            from '@/models/system/RecoveryCampaign';
import { ModeSimulationSession, ModeSimulationScenarioResult } from '@/models/system/ModeSimulation';
import { CANONICAL_MODE_PROFILES }     from './operatingModeSystem';
import type { ModeName }               from '@/models/system/OperatingMode';

const COST_UNIT = () => parseFloat(process.env.COST_UNIT_RATE ?? '2');

// ── 1. Mode profile resolver (pure, no DB) ────────────────────────────────
export function getSimulatedOperatingMode(modeName: ModeName) {
  return CANONICAL_MODE_PROFILES[modeName] ?? CANONICAL_MODE_PROFILES.balanced;
}

// ── 2. Simulate one decision under a mode ────────────────────────────────
// Uses actual mode parameters — not hardcoded string comparisons
export function simulateDecisionUnderMode(input: {
  sourceDecision: any;   // GovernedDecisionRecord (lean)
  modeName:       ModeName;
}): { actionType: string; governanceVerdict: string; rollbackRiskDelta: number; simulationNote: string } {
  const mode    = getSimulatedOperatingMode(input.modeName);
  const src     = input.sourceDecision;
  const srcAction    = src?.finalDecision?.actionType ?? 'observe_only';
  const srcRiskBand  = src?.finalDecision?.riskBand   ?? 'low';
  const srcConf      = src?.plannerOutput?.confidence ?? 0.65;

  // Does the plan pass the mode's confidence threshold?
  const passesPlanner = srcConf >= mode.planner.confidenceThreshold || mode.planner.allowWeakCandidates;

  // Governance verdict: base on risk band + approval strictness
  const riskRank = { low: 1, medium: 2, high: 3 }[srcRiskBand as string] ?? 1;
  const strictScore = mode.governance.approvalStrictness * riskRank;

  let governanceVerdict: string;
  if (!passesPlanner) {
    governanceVerdict = 'block';
  } else if (strictScore >= 3.6) {
    governanceVerdict = 'approval_required';
  } else if (strictScore >= 2.4) {
    governanceVerdict = 'allow_shadow';
  } else if (mode.response.autoResponseAllowance >= 1.0 && riskRank <= 2) {
    governanceVerdict = 'allow';
  } else {
    governanceVerdict = 'allow_shadow';
  }

  // Simulated action under this mode
  let actionType = srcAction;
  if (governanceVerdict === 'block') {
    actionType = 'observe_only';
  } else if (mode.prevention.preventionBias >= 1.4 && srcAction.includes('replay')) {
    actionType = srcAction;  // prevention_first amplifies replay actions
  } else if (mode.recovery.containmentBias >= 1.4) {
    actionType = srcAction.includes('rollback') ? srcAction : `containment_${srcAction}`;
  }

  // Rollback risk delta — based on mode's defense parameters
  const rollbackBaseline = -4;  // do-nothing opportunity cost
  const rollbackDelta =
    mode.recovery.containmentBias >= 1.4  ? -18 :   // recovery mode is most defensive
    mode.prevention.preventionBias >= 1.4 ? -12 :   // prevention_first catches early
    mode.exploration.explorationBias >= 1.3 ? -6 :  // aggressive: more action but more exposure
    mode.governance.approvalStrictness >= 1.3 ? -7: // conservative: cautious but slower
    rollbackBaseline;

  const simulationNote = `${input.modeName}: conf_threshold=${mode.planner.confidenceThreshold} → ${passesPlanner ? 'passes planner' : 'blocked by planner'}, strictScore=${strictScore.toFixed(2)} → ${governanceVerdict}`;

  return { actionType, governanceVerdict, rollbackRiskDelta: rollbackDelta, simulationNote };
}

// ── 3. Simulated economics ────────────────────────────────────────────────
export function computeModeSimulationEconomics(input: {
  modeName:          ModeName;
  baselineRisk:      number;   // 0-100 risk score of the source
  simulatedDecision: { governanceVerdict: string; rollbackRiskDelta: number; actionType: string };
}): { estimatedCostAvoided: number; estimatedDowntimePrevented: number; estimatedGovernanceLoad: number; actionCost: number } {
  const mode = getSimulatedOperatingMode(input.modeName);
  const rate = COST_UNIT();

  // Base action cost by type
  const actionCost = input.simulatedDecision.actionType === 'observe_only' ? 2 :
    input.simulatedDecision.actionType.includes('rollback') ? 30 :
    input.simulatedDecision.actionType.includes('containment') ? 22 : 12;

  // Governance load by verdict
  const baseGovLoad = input.simulatedDecision.governanceVerdict === 'approval_required' ? 25 :
    input.simulatedDecision.governanceVerdict === 'allow_shadow' ? 12 :
    input.simulatedDecision.governanceVerdict === 'block' ? 5 : 8;
  const governanceLoad = +(baseGovLoad * mode.economics.governanceLoadSensitivity).toFixed(2);

  // Cost avoided increases with rollback risk delta magnitude, scaled by mode's downtime sensitivity
  const avoidedBase = Math.max(0, input.baselineRisk * 1.2 + Math.abs(input.simulatedDecision.rollbackRiskDelta) * 10);
  const estimatedCostAvoided = +(avoidedBase * mode.economics.downtimeSensitivity).toFixed(2);

  // Downtime prevented: minutes
  const downtimeBase = Math.max(0, input.baselineRisk * 1.5 + Math.abs(input.simulatedDecision.rollbackRiskDelta) * 2.5);
  const estimatedDowntimePrevented = +(downtimeBase * mode.economics.downtimeSensitivity).toFixed(2);

  return { estimatedCostAvoided, estimatedDowntimePrevented, estimatedGovernanceLoad: governanceLoad, actionCost };
}

// ── 4. Comparative analysis ───────────────────────────────────────────────
export function compareModeSimulationResults(input: {
  results: Array<{ modeName: string; metrics: any }>;
}): { bestModeByEconomics: string | null; safestMode: string | null; fastestRecoveryMode: string | null; lowestGovernanceLoadMode: string | null } {
  const r = input.results;
  if (r.length === 0) return { bestModeByEconomics: null, safestMode: null, fastestRecoveryMode: null, lowestGovernanceLoadMode: null };

  const bestModeByEconomics      = [...r].sort((a, b) => (b.metrics.estimatedCostAvoided - b.metrics.estimatedGovernanceLoad) - (a.metrics.estimatedCostAvoided - a.metrics.estimatedGovernanceLoad))[0]?.modeName ?? null;
  const safestMode               = [...r].sort((a, b) => a.metrics.rollbackRiskScore - b.metrics.rollbackRiskScore)[0]?.modeName ?? null;
  const fastestRecoveryMode      = [...r].sort((a, b) => b.metrics.preventionSuccessScore - a.metrics.preventionSuccessScore)[0]?.modeName ?? null;
  const lowestGovernanceLoadMode = [...r].sort((a, b) => a.metrics.estimatedGovernanceLoad - b.metrics.estimatedGovernanceLoad)[0]?.modeName ?? null;

  return { bestModeByEconomics, safestMode, fastestRecoveryMode, lowestGovernanceLoadMode };
}

// ── 5. Session orchestrator ───────────────────────────────────────────────
const SESSION_DEFAULTS: ModeName[] = ['conservative', 'balanced', 'aggressive', 'recovery', 'prevention_first'];

export async function runModeSimulationSession(input: {
  sessionType:      'decision_replay' | 'forecast_preview' | 'weekly_backtest' | 'campaign_preview';
  baselineMode:     ModeName;
  comparisonModes?: ModeName[];
  sourceRefs?:      string[];     // optional traceIds/forecastKeys to pin specific records
  periodHours?:     number;       // look-back window for real history (default: 24h)
}): Promise<any> {
  await connectToDatabase();

  const comparisonModes = input.comparisonModes ?? SESSION_DEFAULTS;
  const sessionKey      = `mode-sim::${input.sessionType}::${Date.now()}`;
  const horizonMs       = (input.periodHours ?? 24) * 3_600_000;
  const cutoff          = new Date(Date.now() - horizonMs);

  // Record session
  await ModeSimulationSession.create({
    sessionKey,
    sessionType:     input.sessionType,
    baselineMode:    input.baselineMode,
    comparisonModes,
    sourceRefs:      input.sourceRefs ?? [],
    status:          'running',
  });

  // ── Source data from real history ────────────────────────────────────
  let sourceDecisions: any[] = [];
  let sourceRefs: string[]   = [];

  if (input.sessionType === 'decision_replay' || input.sessionType === 'weekly_backtest') {
    const records = await GovernedDecisionRecord.find({ createdAt: { $gte: cutoff } }).sort({ createdAt: -1 }).limit(20).lean() as any[];
    sourceDecisions = records.map((r: any) => ({
      traceId:      r.traceId,
      baselineRisk: r.riskScore ?? r.plannerOutput?.confidence ? (1 - (r.plannerOutput?.confidence ?? 0.6)) * 80 : 35,
      finalDecision: r.finalDecision,
      plannerOutput: r.plannerOutput,
    }));
    sourceRefs = records.map((r: any) => r.traceId ?? '').filter(Boolean);
  }

  if (input.sessionType === 'forecast_preview') {
    const latest = await GlobalStabilityForecast.findOne().sort({ generatedAt: -1 }).lean() as any;
    const targets = (latest?.targets ?? []).filter((t: any) => ['at_risk', 'critical'].includes(t.forecastState)).slice(0, 10);
    sourceDecisions = targets.map((t: any) => ({
      traceId:       `forecast::${t.targetKey}`,
      baselineRisk:  t.riskScore ?? 50,
      finalDecision: { actionType: 'trigger_replay_scan', riskBand: 'low' },
      plannerOutput: { confidence: t.confidence ?? 0.6 },
    }));
    sourceRefs = [latest?.forecastKey ?? 'latest-forecast'];
  }

  if (input.sessionType === 'campaign_preview') {
    const campaigns = await RecoveryCampaign.find({ status: { $in: ['active', 'stabilizing'] } }).limit(5).lean() as any[];
    sourceDecisions = campaigns.map((c: any) => ({
      traceId:       `campaign::${c.campaignKey}`,
      baselineRisk:  Math.min(100, (c.affectedScopes?.length ?? 1) * 15),
      finalDecision: { actionType: 'stage_campaign_observe_mode', riskBand: 'low' },
      plannerOutput: { confidence: 0.7 },
    }));
    sourceRefs = campaigns.map((c: any) => c.campaignKey ?? '').filter(Boolean);
  }

  // ── Fallback if no real data yet ─────────────────────────────────────
  if (sourceDecisions.length === 0) {
    sourceDecisions = [
      { traceId: 'sim-seed-1', baselineRisk: 55, finalDecision: { actionType: 'trigger_replay_scan',        riskBand: 'low'    }, plannerOutput: { confidence: 0.72 } },
      { traceId: 'sim-seed-2', baselineRisk: 40, finalDecision: { actionType: 'shift_weight_profile_shadow', riskBand: 'medium' }, plannerOutput: { confidence: 0.61 } },
      { traceId: 'sim-seed-3', baselineRisk: 75, finalDecision: { actionType: 'stage_shadow_playbook',       riskBand: 'low'    }, plannerOutput: { confidence: 0.65 } },
    ];
    sourceRefs = ['seed-data'];
  }

  // ── Run simulation for each mode ─────────────────────────────────────
  const results: any[] = [];

  for (const modeName of comparisonModes) {
    let actionsAllowed = 0, actionsBlocked = 0, actionsShadowed = 0, approvalsRequired = 0;
    let totalCostAvoided = 0, totalDowntimePrevented = 0, totalGovernanceLoad = 0;
    let rollbackRiskSum = 0, preventionSuccessSum = 0;
    const simDecisions: any[] = [];

    for (const decision of sourceDecisions) {
      const sim  = simulateDecisionUnderMode({ sourceDecision: decision, modeName: modeName as ModeName });
      const econ = computeModeSimulationEconomics({ modeName, baselineRisk: decision.baselineRisk, simulatedDecision: sim });

      if (sim.governanceVerdict === 'allow')             actionsAllowed++;
      else if (sim.governanceVerdict === 'block')        actionsBlocked++;
      else if (sim.governanceVerdict === 'allow_shadow') actionsShadowed++;
      else if (sim.governanceVerdict === 'approval_required') approvalsRequired++;

      totalCostAvoided     += econ.estimatedCostAvoided;
      totalDowntimePrevented += econ.estimatedDowntimePrevented;
      totalGovernanceLoad  += econ.estimatedGovernanceLoad;
      rollbackRiskSum      += Math.max(0, 100 + sim.rollbackRiskDelta);
      preventionSuccessSum += Math.max(0, 100 - Math.abs(sim.rollbackRiskDelta));

      simDecisions.push({ traceId: decision.traceId, actionType: sim.actionType, governanceVerdict: sim.governanceVerdict, rollbackRiskDelta: sim.rollbackRiskDelta, note: sim.simulationNote });
    }

    const n = sourceDecisions.length;
    const metrics = {
      actionsAllowed, actionsBlocked, actionsShadowed, approvalsRequired,
      estimatedCostAvoided:       +totalCostAvoided.toFixed(2),
      estimatedDowntimePrevented: +totalDowntimePrevented.toFixed(2),
      estimatedGovernanceLoad:    +totalGovernanceLoad.toFixed(2),
      rollbackRiskScore:          +(rollbackRiskSum / n).toFixed(2),
      instabilityExposureScore:   +(rollbackRiskSum / n / 100).toFixed(3),
      preventionSuccessScore:     +(preventionSuccessSum / n).toFixed(2),
    };

    const narrative = `Under ${modeName}: ${actionsAllowed} auto-executed, ${actionsShadowed} shadowed, ${approvalsRequired} approval-required, ${actionsBlocked} blocked. ` +
      `Estimated cost avoided $${(totalCostAvoided * COST_UNIT()).toFixed(0)}, downtime prevented ${totalDowntimePrevented.toFixed(0)} min, governance load ${totalGovernanceLoad.toFixed(0)} units.`;

    const resultKey = `${sessionKey}::${modeName}`;
    await ModeSimulationScenarioResult.create({ resultKey, sessionKey, modeName, simulatedDecisions: simDecisions, metrics, narrativeSummary: narrative });

    results.push({ modeName, metrics, simulatedDecisions: simDecisions, narrativeSummary: narrative });
  }

  // ── Compare and finalize session ─────────────────────────────────────
  const summary = compareModeSimulationResults({ results });

  await ModeSimulationSession.findOneAndUpdate(
    { sessionKey },
    { status: 'completed', sourceRefs, summary },
    { new: true }
  );

  return { sessionKey, sessionType: input.sessionType, baselineMode: input.baselineMode, sourceDecisionCount: sourceDecisions.length, results, summary };
}

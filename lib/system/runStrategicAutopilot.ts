/**
 * lib/system/runStrategicAutopilot.ts
 *
 * Complete strategic autopilot — 7 exports.
 *
 *   collectAutopilotSignals         pulls live signals from real DB models
 *   scoreModeRecommendation         weighted score for one mode given signal set
 *   recommendOperatingMode          scores ALL 5 modes, picks winner (not waterfall if/else)
 *   validateAutopilotDecision       guardrail check pre-execution
 *   scheduleModeShift               persists a ScheduledModeShift record
 *   applyDueScheduledShifts         applies + reverts timed shifts (run on schedule)
 *   runStrategicAutopilot           full cycle: signals → score → recommend → guard → schedule/execute → audit
 *
 * RULE: Autopilot guides strategy, not overrides trust.
 *       Every recommendation is explainable, traceable, and reversible.
 *       allowAutoSwitch=false (default) → recommendation-only, no live switching.
 */
import connectToDatabase               from '@/lib/mongodb';
import { StrategicAutopilotPolicy, StrategicAutopilotEvent, ScheduledModeShift } from '@/models/system/StrategicAutopilot';
import { setActiveOperatingMode, getActiveOperatingMode }  from './operatingModeSystem';
import type { ModeName }               from '@/models/system/OperatingMode';

const MODE_NAMES: ModeName[] = ['conservative', 'balanced', 'aggressive', 'recovery', 'prevention_first'];

// ── 1. Live signal collector ──────────────────────────────────────────────
export async function collectAutopilotSignals(): Promise<{
  instabilityScore: number;
  forecastPressure: number;
  harmRate:         number;
  governanceLoad:   number;
  simulationSummary: any;
}> {
  await connectToDatabase();

  let instabilityScore = 0, harmRate = 0, forecastPressure = 0, governanceLoad = 0;
  let simulationSummary: any = {};

  // MetaGovernorSnapshot → instability + harm
  try {
    const MetaGovernorSnapshot = (await import('@/models/system/MetaGovernorSnapshot')).default;
    const snap = await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any;
    instabilityScore = snap?.systemHealth?.rollbackRiskScore ?? snap?.systemHealth?.instabilityScore ?? 0;
    harmRate         = snap?.authorityStats?.harmRate        ?? snap?.authorityStats?.operatorOverrideRate ?? 0;
    governanceLoad   = Math.min(100, ((snap?.authorityStats?.arbitrationCount ?? 0) / Math.max(snap?.authorityStats?.totalDecisions ?? 1, 1)) * 100 * 3);
  } catch (_) {}

  // GlobalStabilityForecast → forecastPressure
  try {
    const { GlobalStabilityForecast } = await import('@/models/system/GlobalStabilityForecast');
    const latest = await GlobalStabilityForecast.findOne().sort({ generatedAt: -1 }).lean() as any;
    const crit   = (latest?.targets ?? []).filter((t: any) => t.forecastState === 'critical').length;
    const atRisk = (latest?.targets ?? []).filter((t: any) => t.forecastState === 'at_risk').length;
    forecastPressure = Math.min(100, crit * 25 + atRisk * 12);
  } catch (_) {}

  // ResilienceEconomicSummary → governance load proxy
  try {
    const { ResilienceEconomicSummary } = await import('@/models/system/ResilienceEconomics');
    const econ = await ResilienceEconomicSummary.findOne().sort({ createdAt: -1 }).lean() as any;
    if (econ?.roi != null && econ.roi < 0.5) {
      // Low ROI = governance overhead is not paying off → high governance load signal
      governanceLoad = Math.max(governanceLoad, 60);
    }
  } catch (_) {}

  // Latest simulation summary for simulation-guided recommendations
  try {
    const { ModeSimulationSession } = await import('@/models/system/ModeSimulation');
    const sim = await ModeSimulationSession.findOne({ status: 'completed' }).sort({ createdAt: -1 }).lean() as any;
    simulationSummary = sim?.summary ?? {};
  } catch (_) {}

  return { instabilityScore, forecastPressure, harmRate, governanceLoad, simulationSummary };
}

// ── 2. Mode scorer (one mode at a time) ──────────────────────────────────
export function scoreModeRecommendation(input: {
  signals: { instabilityScore: number; forecastPressure: number; harmRate: number; governanceLoad: number };
  targetMode: ModeName;
  simulationSummary?: any;
}): number {
  const s = input.signals;
  let score = 0;

  switch (input.targetMode) {
    case 'recovery':
      // Recovery scores when instability is high
      score += s.instabilityScore * 0.45;
      score += Math.max(0, s.harmRate * 100 - 15) * 0.20;    // escalates if harm is genuinely bad
      score -= s.forecastPressure * 0.05;                     // slight penalty vs prevention when forecast high
      break;

    case 'prevention_first':
      // Prevention scores when forecast pressure is high but system not already failing
      score += s.forecastPressure * 0.40;
      score -= s.instabilityScore * 0.10;                     // if already failing, recovery > prevention
      score += Math.max(0, 30 - s.instabilityScore) * 0.15;  // bonus when stable enough to prevent
      break;

    case 'balanced':
      // Balanced scores when all signals are moderate — it's the "everything is okay" mode
      score += (100 - Math.max(s.instabilityScore, s.forecastPressure)) * 0.25;
      score += (1 - Math.min(s.harmRate, 0.3) / 0.3) * 15;   // high harm → less balanced
      break;

    case 'aggressive':
      // Aggressive scores when governance load is high AND system is healthy
      score += s.governanceLoad * 0.30;
      score -= s.instabilityScore * 0.35;                     // heavily penalized by instability
      score -= s.harmRate * 100 * 0.40;                       // heavily penalized by harm
      break;

    case 'conservative':
      // Conservative scores when harm rate rises OR after aggressive exposure
      score += s.harmRate * 100 * 0.35;
      score += Math.max(0, s.instabilityScore - 50) * 0.10;   // moderately high instability boosts conservative
      score -= s.governanceLoad * 0.15;                       // doesn't help with governance overload
      break;
  }

  // Simulation alignment bonus: +8 if simulation agrees this is the best economic mode
  if (input.simulationSummary?.bestModeByEconomics === input.targetMode) score += 8;
  if (input.simulationSummary?.safestMode          === input.targetMode) score += 5;

  return Math.max(0, +score.toFixed(2));
}

// ── 3. Mode recommender (scores ALL 5 modes — no waterfall if/else) ───────
interface ModeRecommendation {
  recommendedMode: ModeName;
  confidenceScore: number;
  allScores:       Record<ModeName, number>;
  reasons:         string[];
}

export function recommendOperatingMode(input: {
  currentMode:      string;
  signals:          { instabilityScore: number; forecastPressure: number; harmRate: number; governanceLoad: number };
  simulationSummary?: any;
  policy?:          any;
}): ModeRecommendation | null {
  const allScores: Record<string, number> = {};

  for (const mode of MODE_NAMES) {
    allScores[mode] = scoreModeRecommendation({ signals: input.signals, targetMode: mode, simulationSummary: input.simulationSummary });
  }

  const ranked = MODE_NAMES.slice().sort((a, b) => allScores[b] - allScores[a]);
  const winner = ranked[0] as ModeName;
  const winnerScore = allScores[winner];
  const minScore = input.policy?.thresholds?.confidenceMinimum ?? 25;

  // Don't recommend if confidence is too low or if recommended mode === current mode
  if (winnerScore < minScore) return null;
  if (winner === input.currentMode) return null;

  const s   = input.signals;
  const reasons: string[] = [];
  if (winner === 'recovery' && s.instabilityScore > 50)          reasons.push(`System instability score ${s.instabilityScore.toFixed(0)} is elevated`);
  if (winner === 'prevention_first' && s.forecastPressure > 50)  reasons.push(`Forecast pressure ${s.forecastPressure.toFixed(0)} indicates rising risk`);
  if (winner === 'aggressive' && s.governanceLoad > 60)          reasons.push(`Governance load ${s.governanceLoad.toFixed(0)} is high — reducing oversight burden is worthwhile`);
  if (winner === 'conservative' && s.harmRate > 0.15)            reasons.push(`Harm rate ${(s.harmRate * 100).toFixed(0)}% exceeds safe range`);
  if (winner === 'balanced' && input.currentMode !== 'balanced')  reasons.push(`System signals have normalized — returning to steady-state posture`);
  if (input.simulationSummary?.bestModeByEconomics === winner)   reasons.push(`Simulation indicates best economic outcome under this mode`);
  if (reasons.length === 0)                                       reasons.push(`Weighted signal scoring selected ${winner} as optimal for current conditions`);

  return { recommendedMode: winner, confidenceScore: winnerScore, allScores: allScores as any, reasons };
}

// ── 4. Guardrail validator ────────────────────────────────────────────────
export function validateAutopilotDecision(input: {
  recommendedMode: ModeName;
  currentMode:     string;
  allowAutoSwitch: boolean;
  requireApprovalFor: string[];
}): { allowed: boolean; requiresApproval: boolean; reason: string } {
  if (!input.allowAutoSwitch) {
    return { allowed: false, requiresApproval: false, reason: 'Auto-switch is disabled — recommendation only' };
  }
  if (input.requireApprovalFor.includes(input.recommendedMode)) {
    return { allowed: true, requiresApproval: true, reason: `"${input.recommendedMode}" requires explicit approval before activation` };
  }
  // Additional hard safety: aggressive can never auto-activate globally
  if (input.recommendedMode === 'aggressive') {
    return { allowed: true, requiresApproval: true, reason: 'Aggressive mode always requires approval regardless of policy settings' };
  }
  return { allowed: true, requiresApproval: false, reason: 'Auto-switch permitted within safety constraints' };
}

// ── 5. Schedule a timed mode shift ────────────────────────────────────────
export async function scheduleModeShift(input: {
  modeName:      ModeName;
  durationHours: number;
  revertTo?:     ModeName | null;
  eventKey?:     string;
  reason:        string;
  approvedBy?:   string;
}): Promise<{ shiftKey: string; startAt: Date; endAt: Date }> {
  await connectToDatabase();
  const now      = new Date();
  const endAt    = new Date(now.getTime() + input.durationHours * 3_600_000);
  const shiftKey = `shift::${input.modeName}::${Date.now()}`;

  await ScheduledModeShift.create({
    shiftKey,
    eventKey:   input.eventKey ?? null,
    modeName:   input.modeName,
    startAt:    now,
    endAt,
    revertTo:   input.revertTo ?? null,
    reason:     input.reason,
    status:     'pending',
    approvedBy: input.approvedBy ?? null,
  });

  return { shiftKey, startAt: now, endAt };
}

// ── 6. Apply due scheduled shifts ─────────────────────────────────────────
export async function applyDueScheduledShifts(): Promise<{ applied: string[]; reverted: string[] }> {
  await connectToDatabase();
  const now     = new Date();
  const applied: string[] = [];
  const reverted:string[] = [];

  // Apply pending shifts whose startAt has passed
  const due = await ScheduledModeShift.find({ status: 'pending', startAt: { $lte: now } }).lean() as any[];
  for (const shift of due) {
    try {
      await setActiveOperatingMode({ newMode: shift.modeName, initiatedBy: 'system', reason: `Scheduled shift: ${shift.reason}` });
      await ScheduledModeShift.findOneAndUpdate({ shiftKey: shift.shiftKey }, { status: 'applied' });
      applied.push(shift.shiftKey);
    } catch (e) {
      await ScheduledModeShift.findOneAndUpdate({ shiftKey: shift.shiftKey }, { status: 'expired' });
    }
  }

  // Revert applied shifts whose endAt has passed
  const expired = await ScheduledModeShift.find({ status: 'applied', endAt: { $lte: now } }).lean() as any[];
  for (const shift of expired) {
    if (shift.revertTo) {
      try {
        await setActiveOperatingMode({ newMode: shift.revertTo as ModeName, initiatedBy: 'system', reason: `Reverting scheduled shift ${shift.shiftKey}` });
        reverted.push(shift.shiftKey);
      } catch (_) {}
    }
    await ScheduledModeShift.findOneAndUpdate({ shiftKey: shift.shiftKey }, { status: 'reverted' });
  }

  return { applied, reverted };
}

// ── 7. Full autopilot run cycle ───────────────────────────────────────────
export async function runStrategicAutopilot(options?: {
  overrideSignals?: { instabilityScore?: number; forecastPressure?: number; harmRate?: number; governanceLoad?: number };
}): Promise<any> {
  await connectToDatabase();

  // Load policy (or use safe default)
  const policy = await StrategicAutopilotPolicy.findOne({ enabled: true }).lean() as any ?? {
    allowAutoSwitch: false,
    requireApprovalFor: ['aggressive'],
    thresholds: { confidenceMinimum: 25 },
    scheduling:  { defaultDurationHours: 48 },
    generateNarrative: true,
  };

  // Collect signals
  const rawSignals = await collectAutopilotSignals();
  const signals = { ...rawSignals, ...options?.overrideSignals };

  // Apply any due scheduled shifts first
  const shifts = await applyDueScheduledShifts();

  // Get current mode
  const currentModeProfile = await getActiveOperatingMode();
  const currentMode        = currentModeProfile.modeName as ModeName;

  // Compute recommendation
  const recommendation = recommendOperatingMode({ currentMode, signals, simulationSummary: signals.simulationSummary, policy });

  if (!recommendation) {
    return { status: 'no_change', currentMode, signals, appliedShifts: shifts, reason: 'No mode change recommended at this time — current mode is appropriate for system state' };
  }

  // Guardrail check
  const guard = validateAutopilotDecision({ recommendedMode: recommendation.recommendedMode, currentMode, allowAutoSwitch: policy.allowAutoSwitch, requireApprovalFor: policy.requireApprovalFor });

  // Record event
  const eventKey   = `autopilot::${recommendation.recommendedMode}::${Date.now()}`;
  let shiftRecord  = null;
  let narrativeKey = null;
  let outcome      = 'pending';

  if (guard.allowed && !guard.requiresApproval) {
    // Auto-switch is permitted
    await setActiveOperatingMode({ newMode: recommendation.recommendedMode, initiatedBy: 'system', reason: recommendation.reasons.join('; ') });
    outcome     = 'auto_applied';
    // Create a timed shift to revert after defaultDurationHours
    shiftRecord = await scheduleModeShift({ modeName: recommendation.recommendedMode, durationHours: policy.scheduling?.defaultDurationHours ?? 48, revertTo: currentMode, eventKey, reason: `Auto-applied by strategic autopilot: ${recommendation.reasons[0]}` });
  }

  // Generate operator narrative
  if (policy.generateNarrative) {
    try {
      const { runNarrativeGeneration } = await import('./runNarrativeGeneration');
      const narrative = await runNarrativeGeneration({ narrativeType: 'action_summary', audience: 'operator' });
      narrativeKey = narrative.narrativeKey;
    } catch (_) {}
  }

  await StrategicAutopilotEvent.create({
    eventKey,
    currentMode,
    recommendedMode:  recommendation.recommendedMode,
    confidenceScore:  recommendation.confidenceScore,
    reasons:          recommendation.reasons,
    allScores:        recommendation.allScores,
    signals: { instabilityScore: signals.instabilityScore, forecastPressure: signals.forecastPressure, harmRate: signals.harmRate, governanceLoad: signals.governanceLoad },
    simulationSummary: signals.simulationSummary,
    outcome,
    executedAt:       outcome === 'auto_applied' ? new Date() : null,
    scheduledShiftKey:shiftRecord?.shiftKey ?? null,
    narrativeKey,
  });

  return {
    status:          guard.allowed && !guard.requiresApproval ? 'auto_applied' : guard.requiresApproval ? 'pending_approval' : 'recommendation',
    eventKey,
    currentMode,
    recommendation,
    guard,
    shiftScheduled:  shiftRecord,
    appliedShifts:   shifts,
    signals,
    policy:          { allowAutoSwitch: policy.allowAutoSwitch, requireApprovalFor: policy.requireApprovalFor },
    narrativeKey,
  };
}

// ── Default policy seeder ─────────────────────────────────────────────────
export async function seedAutopilotPolicy(): Promise<{ created: boolean }> {
  await connectToDatabase();
  const exists = await StrategicAutopilotPolicy.findOne({ policyKey: 'global::default' }).lean();
  if (exists) return { created: false };
  await StrategicAutopilotPolicy.create({
    policyKey: 'global::default',
    enabled: true,
    allowAutoSwitch: false,   // Phase 1: recommendation only
    requireApprovalFor: ['aggressive'],
    thresholds: { instabilityHigh: 70, instabilityRecoveryExit: 35, forecastPressureHigh: 70, harmRateHigh: 0.20, governanceLoadHigh: 75, confidenceMinimum: 25 },
    scheduling: { allowScheduledSwitches: true, defaultDurationHours: 48, checkIntervalMinutes: 30 },
    simulationRequired: true,
    generateNarrative:  true,
    scope: { level: 'global' },
  });
  return { created: true };
}

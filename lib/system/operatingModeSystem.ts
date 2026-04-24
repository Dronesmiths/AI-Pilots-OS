/**
 * lib/system/operatingModeSystem.ts
 *
 * All operating mode logic — 6 exports.
 *
 *   CANONICAL_MODE_PROFILES       seeded parameter definitions (5 modes)
 *   getActiveOperatingMode        queries DB for isActive=true, falls back to balanced
 *   setActiveOperatingMode        governed mode switch with audit trail + approval enforcement
 *   evaluateOperatingModeTransition  signal-driven transition advisor (advisory, not automatic)
 *   applyModeAdapters             cross-layer parameter adjustment surface
 *   seedOperatingModeProfiles     idempotent seeder
 *
 * RULE: Operating mode changes posture, not law.
 *       Mode cannot bypass constitutional safety, operator governance, or audit.
 *
 * TRANSITION RULES (enforced in setActiveOperatingMode):
 *   conservative → aggressive  : requiresApproval=true (never auto)
 *   recovery → aggressive      : requiresApproval=true
 *   * → lower approvalStrictness < 0.9: requiresApproval=true
 *   balanced → recovery        : allowed when instabilityScore > 75
 *   recovery → balanced        : allowed when instabilityScore < 35
 */
import connectToDatabase               from '@/lib/mongodb';
import { OperatingModeProfile, OperatingModeChangeEvent, type ModeName } from '@/models/system/OperatingMode';

// ── Canonical mode parameter definitions ─────────────────────────────────
export const CANONICAL_MODE_PROFILES: Record<ModeName, any> = {
  conservative: {
    modeKey: 'mode::conservative', modeName: 'conservative',
    planner:    { confidenceThreshold: 0.75, allowWeakCandidates: false },
    exploration:{ explorationBias: 0.60,  challengerWidth: 0.70 },
    policy:     { promotionThreshold: 1.20, rollbackSensitivity: 1.35, activePolicyStrength: 0.85 },
    prevention: { preventionBias: 0.90,  lightActionPreference: 1.10 },
    response:   { autoResponseAllowance: 0.60, escalationBias: 1.20 },
    recovery:   { containmentBias: 1.00, playbookAggressiveness: 0.80, campaignCoordinationBias: 1.00 },
    governance: { approvalStrictness: 1.30, emergencySensitivity: 1.20 },
    economics:  { costSensitivity: 1.20, downtimeSensitivity: 1.00, governanceLoadSensitivity: 1.20 },
    narratives: { emphasizeRisk: true, emphasizeSavings: false, emphasizePrevention: false },
  },
  balanced: {
    modeKey: 'mode::balanced', modeName: 'balanced',
    planner:    { confidenceThreshold: 0.65, allowWeakCandidates: false },
    exploration:{ explorationBias: 1.00, challengerWidth: 1.00 },
    policy:     { promotionThreshold: 1.00, rollbackSensitivity: 1.00, activePolicyStrength: 1.00 },
    prevention: { preventionBias: 1.00, lightActionPreference: 1.00 },
    response:   { autoResponseAllowance: 1.00, escalationBias: 1.00 },
    recovery:   { containmentBias: 1.00, playbookAggressiveness: 1.00, campaignCoordinationBias: 1.00 },
    governance: { approvalStrictness: 1.00, emergencySensitivity: 1.00 },
    economics:  { costSensitivity: 1.00, downtimeSensitivity: 1.00, governanceLoadSensitivity: 1.00 },
    narratives: { emphasizeRisk: true, emphasizeSavings: true, emphasizePrevention: false },
  },
  aggressive: {
    modeKey: 'mode::aggressive', modeName: 'aggressive',
    planner:    { confidenceThreshold: 0.55, allowWeakCandidates: true },
    exploration:{ explorationBias: 1.35, challengerWidth: 1.25 },
    policy:     { promotionThreshold: 0.80, rollbackSensitivity: 0.85, activePolicyStrength: 1.20 },
    prevention: { preventionBias: 1.10, lightActionPreference: 0.90 },
    response:   { autoResponseAllowance: 1.25, escalationBias: 0.85 },
    recovery:   { containmentBias: 0.90, playbookAggressiveness: 1.15, campaignCoordinationBias: 1.10 },
    governance: { approvalStrictness: 0.80, emergencySensitivity: 0.90 },
    economics:  { costSensitivity: 0.85, downtimeSensitivity: 1.00, governanceLoadSensitivity: 0.80 },
    narratives: { emphasizeRisk: false, emphasizeSavings: true, emphasizePrevention: false },
  },
  recovery: {
    modeKey: 'mode::recovery', modeName: 'recovery',
    planner:    { confidenceThreshold: 0.70, allowWeakCandidates: false },
    exploration:{ explorationBias: 0.50, challengerWidth: 0.75 },
    policy:     { promotionThreshold: 1.10, rollbackSensitivity: 1.40, activePolicyStrength: 0.95 },
    prevention: { preventionBias: 0.90, lightActionPreference: 0.85 },
    response:   { autoResponseAllowance: 0.95, escalationBias: 1.35 },
    recovery:   { containmentBias: 1.50, playbookAggressiveness: 1.30, campaignCoordinationBias: 1.35 },
    governance: { approvalStrictness: 1.10, emergencySensitivity: 1.30 },
    economics:  { costSensitivity: 1.00, downtimeSensitivity: 1.35, governanceLoadSensitivity: 1.00 },
    narratives: { emphasizeRisk: true, emphasizeSavings: false, emphasizePrevention: false },
  },
  prevention_first: {
    modeKey: 'mode::prevention_first', modeName: 'prevention_first',
    planner:    { confidenceThreshold: 0.62, allowWeakCandidates: false },
    exploration:{ explorationBias: 0.95, challengerWidth: 1.00 },
    policy:     { promotionThreshold: 0.95, rollbackSensitivity: 1.05, activePolicyStrength: 0.95 },
    prevention: { preventionBias: 1.50, lightActionPreference: 1.40 },
    response:   { autoResponseAllowance: 1.00, escalationBias: 1.05 },
    recovery:   { containmentBias: 0.95, playbookAggressiveness: 0.95, campaignCoordinationBias: 0.95 },
    governance: { approvalStrictness: 1.00, emergencySensitivity: 1.00 },
    economics:  { costSensitivity: 0.95, downtimeSensitivity: 1.35, governanceLoadSensitivity: 1.00 },
    narratives: { emphasizeRisk: false, emphasizeSavings: true, emphasizePrevention: true },
  },
};

// ── Get active mode (DB-backed, falls back to balanced) ───────────────────
export async function getActiveOperatingMode(input?: { tenantId?: string; scopeKey?: string }): Promise<any & { modeName: ModeName }> {
  await connectToDatabase();
  const active = await OperatingModeProfile.findOne({ isActive: true, enabled: true }).lean() as any;
  if (active) return active;
  // Fallback: return in-memory balanced profile so the system always has a mode
  return { ...CANONICAL_MODE_PROFILES.balanced, _fallback: true };
}

// ── Transition safety rules ───────────────────────────────────────────────
const REQUIRES_APPROVAL: Array<[ModeName, ModeName]> = [
  ['conservative', 'aggressive'],
  ['recovery',     'aggressive'],
  ['balanced',     'aggressive'],  // aggressive via direct jump always requires approval
];

const UNSAFE_DOWNGRADE: Array<[ModeName, string]> = [
  ['aggressive', 'any'],  // moving away from aggressive is fine
];

function transitionRequiresApproval(from: ModeName, to: ModeName, toProfile: any): boolean {
  if (REQUIRES_APPROVAL.some(([f, t]) => f === from && t === to)) return true;
  // Any mode that lowers approvalStrictness below 0.9 requires approval
  if ((toProfile?.governance?.approvalStrictness ?? 1.0) < 0.9) return true;
  return false;
}

// ── Set active mode (governed switch) ────────────────────────────────────
export async function setActiveOperatingMode(input: {
  newMode:       ModeName;
  initiatedBy:   'operator' | 'system' | 'auto_transition';
  reason:        string;
  tenantId?:     string;
  forceApproval?: boolean;   // operator can force approval requirement on any transition
}): Promise<{ ok: boolean; changeKey: string; requiresApproval: boolean; previousMode: string }> {
  await connectToDatabase();

  // Read current mode
  const current   = await OperatingModeProfile.findOne({ isActive: true }).lean() as any;
  const prevMode  = current?.modeName ?? '(none)';

  const newProfile = CANONICAL_MODE_PROFILES[input.newMode];
  const needsApproval = input.forceApproval || transitionRequiresApproval(prevMode as ModeName, input.newMode, newProfile);

  const changeKey = `mode-change::${input.newMode}::${Date.now()}`;

  // If no approval needed — execute immediately
  if (!needsApproval) {
    // Deactivate current
    if (current) await OperatingModeProfile.updateMany({ isActive: true }, { isActive: false });
    // Activate (upsert) new
    await OperatingModeProfile.findOneAndUpdate(
      { modeKey: `mode::${input.newMode}` },
      { ...newProfile, isActive: true, enabled: true },
      { upsert: true, new: true }
    );
  }

  // Always record audit event
  await OperatingModeChangeEvent.create({
    changeKey,
    oldMode:          prevMode,
    newMode:          input.newMode,
    reason:           input.reason,
    initiatedBy:      input.initiatedBy,
    tenantId:         input.tenantId ?? null,
    requiresApproval: needsApproval,
    approved:         needsApproval ? null : true,
    approvedBy:       needsApproval ? null : input.initiatedBy,
  });

  return { ok: true, changeKey, requiresApproval: needsApproval, previousMode: prevMode };
}

// ── Transition advisor (advisory only — does NOT auto-switch) ─────────────
export async function evaluateOperatingModeTransition(input?: {
  instabilityScore?: number;
  forecastPressure?: number;
  harmRate?: number;
}): Promise<{ recommended: { nextMode: ModeName; reason: string } | null; currentMode: string }> {
  await connectToDatabase();

  // Pull live signals if not provided
  let { instabilityScore = 0, forecastPressure = 0, harmRate = 0 } = input ?? {};

  if (!input?.instabilityScore) {
    try {
      // Try to pull from latest MetaGovernorSnapshot
      const MetaGovernorSnapshot = (await import('@/models/system/MetaGovernorSnapshot')).default;
      const snap = await MetaGovernorSnapshot.findOne().sort({ createdAt: -1 }).lean() as any;
      instabilityScore = snap?.systemHealth?.instabilityScore ?? snap?.systemHealth?.rollbackRiskScore ?? 0;
      harmRate         = snap?.authorityStats?.harmRate       ?? snap?.authorityStats?.operatorOverrideRate ?? 0;
    } catch (_) { /* MetaGovernorSnapshot may not be populated yet */ }
  }

  if (!input?.forecastPressure) {
    try {
      const { GlobalStabilityForecast } = await import('@/models/system/GlobalStabilityForecast');
      const latest = await GlobalStabilityForecast.findOne().sort({ generatedAt: -1 }).lean() as any;
      const critCount  = (latest?.targets ?? []).filter((t: any) => t.forecastState === 'critical').length;
      const atRiskCount= (latest?.targets ?? []).filter((t: any) => t.forecastState === 'at_risk').length;
      forecastPressure = Math.min(100, (critCount * 25) + (atRiskCount * 12));
    } catch (_) {}
  }

  const currentMode = (await OperatingModeProfile.findOne({ isActive: true }).lean() as any)?.modeName ?? 'balanced';

  let recommended: { nextMode: ModeName; reason: string } | null = null;

  if (currentMode === 'balanced' && instabilityScore > 75)
    recommended = { nextMode: 'recovery', reason: `System instability score ${instabilityScore.toFixed(0)} crossed recovery threshold (75)` };
  else if (currentMode === 'recovery' && instabilityScore < 35)
    recommended = { nextMode: 'balanced', reason: `System stabilized — instability score ${instabilityScore.toFixed(0)} below recovery exit threshold (35)` };
  else if (currentMode === 'balanced' && forecastPressure > 70)
    recommended = { nextMode: 'prevention_first', reason: `Forecast pressure ${forecastPressure.toFixed(0)} persistently elevated above prevention threshold (70)` };
  else if (currentMode === 'aggressive' && harmRate > 0.2)
    recommended = { nextMode: 'balanced', reason: `Harm rate ${(harmRate * 100).toFixed(0)}% exceeds safe threshold (20%) for aggressive mode` };

  return { recommended, currentMode };
}

// ── Cross-layer adapters ──────────────────────────────────────────────────
/**
 * applyModeAdapters returns adjusted subsystem parameters for the current mode.
 * Callers use this to tune their own thresholds without coupling to specific mode fields.
 */
export function applyModeAdapters(mode: any) {
  const m = mode ?? CANONICAL_MODE_PROFILES.balanced;
  return {
    // Planner: confidence required for a candidate to proceed
    plannerConfidenceThreshold: m.planner?.confidenceThreshold  ?? 0.65,
    allowWeakCandidates:        m.planner?.allowWeakCandidates  ?? false,

    // Exploration: how wide to cast the challenger net
    explorationBias:  m.exploration?.explorationBias  ?? 1.0,
    challengerWidth:  m.exploration?.challengerWidth  ?? 1.0,

    // Policy: how aggressively to promote/roll back
    promotionThreshold:   m.policy?.promotionThreshold   ?? 1.0,
    rollbackSensitivity:  m.policy?.rollbackSensitivity  ?? 1.0,
    activePolicyStrength: m.policy?.activePolicyStrength ?? 1.0,

    // Prevention: how eagerly to preempt vs wait
    preventionBias:        m.prevention?.preventionBias       ?? 1.0,
    lightActionPreference: m.prevention?.lightActionPreference ?? 1.0,

    // Response: how much to auto-execute vs escalate
    autoResponseAllowance: m.response?.autoResponseAllowance ?? 1.0,
    escalationBias:        m.response?.escalationBias        ?? 1.0,

    // Recovery: how aggressively to contain active incidents
    containmentBias:          m.recovery?.containmentBias          ?? 1.0,
    playbookAggressiveness:   m.recovery?.playbookAggressiveness   ?? 1.0,
    campaignCoordinationBias: m.recovery?.campaignCoordinationBias ?? 1.0,

    // Governance: approval threshold multiplier (>1 = stricter)
    approvalStrictness:   m.governance?.approvalStrictness   ?? 1.0,
    emergencySensitivity: m.governance?.emergencySensitivity ?? 1.0,

    // Economics: weighting for different cost dimensions
    costSensitivity:           m.economics?.costSensitivity           ?? 1.0,
    downtimeSensitivity:       m.economics?.downtimeSensitivity       ?? 1.0,
    governanceLoadSensitivity: m.economics?.governanceLoadSensitivity ?? 1.0,

    // Narrative emphasis flags
    emphasizeRisk:       m.narratives?.emphasizeRisk       ?? true,
    emphasizeSavings:    m.narratives?.emphasizeSavings    ?? true,
    emphasizePrevention: m.narratives?.emphasizePrevention ?? false,
  };
}

// ── Seeder ────────────────────────────────────────────────────────────────
export async function seedOperatingModeProfiles(): Promise<{ created: number; skipped: number }> {
  await connectToDatabase();
  let created = 0, skipped = 0;
  for (const [, profile] of Object.entries(CANONICAL_MODE_PROFILES)) {
    const exists = await OperatingModeProfile.findOne({ modeKey: profile.modeKey }).lean();
    if (exists) { skipped++; continue; }
    // Only balanced is active by default
    await OperatingModeProfile.create({ ...profile, isActive: profile.modeName === 'balanced', enabled: true });
    created++;
  }
  return { created, skipped };
}

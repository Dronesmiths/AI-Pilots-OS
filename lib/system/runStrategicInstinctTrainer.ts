/**
 * lib/system/runStrategicInstinctTrainer.ts
 *
 * Strategic Instinct Trainer — 8 exports.
 *
 *   scoreStrategicSourceReliability  accuracy + outcome quality per source from episode history
 *   computeContextMultiplier          detects active context bands → returns per-source multipliers
 *   computeAdjustedTrustWeights       applies context multipliers + reliability then renormalizes
 *   blendStrategicRecommendations     weighted vote: each mode accumulates trust weight from agreeing sources
 *   analyzeStrategicContradiction     names conflicts and rates severity (none/mild/moderate/severe)
 *   recordStrategicEpisode            persists an episode with sourceCorrectness pre-computed
 *   updateStrategicTrustProfile       Bayesian weight update from recent episode outcomes
 *   runStrategicInstinctTrainer       full cycle: load profile → adjust → blend → contradict → record
 *
 * RULE: This layer adjusts trust weights — it does NOT choose the final mode.
 *       The Constitutional Strategy Board's priority chain (override>policy>autopilot>federated)
 *       remains unaffected. Instinct adjusts confidence and blend, not governance authority.
 */
import connectToDatabase                from '@/lib/mongodb';
import { StrategicTrustProfile, StrategicSourceEpisode } from '@/models/system/StrategicInstinct';
import type { ModeName }                from '@/models/system/OperatingMode';

const SOURCE_KEYS = ['liveSignals', 'strategicMemory', 'simulation', 'crossTenant'] as const;
type SourceKey = typeof SOURCE_KEYS[number];
type SourceRecommendations = Partial<Record<SourceKey, string | null>>;
type TrustWeights = Record<SourceKey, number>;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── 1. Source reliability scorer ─────────────────────────────────────────
// For each source: what fraction of past episodes did it agree with the winning mode
// AND correlate with good outcomes? Weighted by outcome quality.
export function scoreStrategicSourceReliability(episodes: any[]): Record<SourceKey, number> {
  const acc: Record<SourceKey, { hits: number; weightedQuality: number; total: number }> = {
    liveSignals:     { hits: 0, weightedQuality: 0, total: 0 },
    strategicMemory: { hits: 0, weightedQuality: 0, total: 0 },
    simulation:      { hits: 0, weightedQuality: 0, total: 0 },
    crossTenant:     { hits: 0, weightedQuality: 0, total: 0 },
  };

  for (const ep of episodes) {
    // Outcome quality: 0-1 (higher = better decision outcome)
    const quality = ep.outcomes?.outcomeRecorded
      ? clamp((ep.outcomes.successScore ?? 0.5) - (ep.outcomes.harmRate ?? 0) - (ep.outcomes.rollbackRate ?? 0), 0, 1)
      : 0.5; // neutral weight for episodes without recorded outcomes

    for (const src of SOURCE_KEYS) {
      if (ep.sourceCorrectness?.[src] == null) continue; // source didn't participate
      acc[src].total++;
      if (ep.sourceCorrectness[src]) {        // was correct (agreed with winning mode)
        acc[src].hits++;
        acc[src].weightedQuality += quality;
      }
    }
  }

  const result: any = {};
  for (const src of SOURCE_KEYS) {
    if (acc[src].total === 0) { result[src] = 0.5; continue; } // no data → neutral
    const hitRate    = acc[src].hits / acc[src].total;
    const avgQuality = acc[src].hits > 0 ? acc[src].weightedQuality / acc[src].hits : 0;
    // Blend hit rate (60%) with average quality on hits (40%)
    result[src] = clamp(hitRate * 0.60 + avgQuality * 0.40, 0, 1);
  }
  return result;
}

// ── 2. Context multiplier (runtime, not stored) ───────────────────────────
// Detects which context bands are active and returns per-source multipliers
export function computeContextMultiplier(
  conditions:  { instabilityScore: number; forecastPressure: number; volatilityScore?: number; cohortDriftScore?: number; replayDisagreement?: number; localDataDepth?: number },
  profileMultipliers: any
): Record<SourceKey, number> {
  const base: Record<SourceKey, number> = { liveSignals: 1.0, strategicMemory: 1.0, simulation: 1.0, crossTenant: 1.0 };
  const pm = profileMultipliers ?? {};

  // High instability → trust live signals more
  if (conditions.instabilityScore > 70 && pm.highInstability)
    for (const s of SOURCE_KEYS) base[s] *= pm.highInstability[s] ?? 1.0;

  // High forecast pressure → trust simulation more
  if (conditions.forecastPressure > 70 && pm.highForecastPressure)
    for (const s of SOURCE_KEYS) base[s] *= pm.highForecastPressure[s] ?? 1.0;

  // Thin local data (< 5 episodes) → trust cross-tenant more
  if ((conditions.localDataDepth ?? 10) < 5 && pm.thinLocalData)
    for (const s of SOURCE_KEYS) base[s] *= pm.thinLocalData[s] ?? 1.0;

  // High cohort drift → distrust cross-tenant
  if ((conditions.cohortDriftScore ?? 0) > 0.5 && pm.highCohortDrift)
    for (const s of SOURCE_KEYS) base[s] *= pm.highCohortDrift[s] ?? 1.0;

  // High replay disagreement → distrust simulation
  if ((conditions.replayDisagreement ?? 0) > 0.6 && pm.highReplayDisagreement)
    for (const s of SOURCE_KEYS) base[s] *= pm.highReplayDisagreement[s] ?? 1.0;

  return base;
}

// ── 3. Adjusted trust weights ─────────────────────────────────────────────
// Applies context multipliers and reliability scores to base weights, then renormalizes to sum=1.0
export function computeAdjustedTrustWeights(
  baseWeights:        TrustWeights,
  contextMultipliers: Record<SourceKey, number>,
  reliabilityScores:  Record<SourceKey, number>
): TrustWeights {
  const raw: Record<SourceKey, number> = {} as any;
  for (const src of SOURCE_KEYS) {
    // reliability score lifts/suppresses the weight (0.5 = neutral multiplier of 1.0)
    const reliabilityMult = 0.5 + reliabilityScores[src]; // 0.5–1.5 range
    raw[src] = baseWeights[src] * contextMultipliers[src] * reliabilityMult;
  }
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const result: any = {};
  for (const src of SOURCE_KEYS) result[src] = +(raw[src] / total).toFixed(4);
  return result;
}

// ── 4. Strategic blend engine ─────────────────────────────────────────────
// Weighted vote: each mode accumulates the trust weight of every source that recommends it.
// Returns ranked modes with their cumulative trust weight.
export function blendStrategicRecommendations(input: {
  sourceRecommendations: SourceRecommendations;
  adjustedWeights:       TrustWeights;
}): { blendedMode: string | null; modeScores: Record<string, number>; participatingSources: number } {
  const modeScores: Record<string, number> = {};
  let participatingSources = 0;

  for (const src of SOURCE_KEYS) {
    const rec = input.sourceRecommendations[src];
    if (!rec) continue;
    participatingSources++;
    modeScores[rec] = (modeScores[rec] ?? 0) + input.adjustedWeights[src];
  }

  const entries = Object.entries(modeScores).sort(([, a], [, b]) => b - a);
  const blendedMode = entries[0]?.[0] ?? null;

  return {
    blendedMode,
    modeScores: Object.fromEntries(entries.map(([m, s]) => [m, +s.toFixed(4)])),
    participatingSources,
  };
}

// ── 5. Contradiction analyzer ─────────────────────────────────────────────
type ConflictSeverity = 'none' | 'mild' | 'moderate' | 'severe';
export function analyzeStrategicContradiction(input: {
  sourceRecommendations: SourceRecommendations;
  adjustedWeights:       TrustWeights;
  blendedMode:           string | null;
}): { severity: ConflictSeverity; conflictingPairs: string[]; dissent: string[]; explanation: string } {
  const active   = Object.entries(input.sourceRecommendations).filter(([, v]) => !!v) as [SourceKey, string][];
  const uniqueModes = [...new Set(active.map(([, m]) => m))];

  if (uniqueModes.length <= 1) return { severity: 'none', conflictingPairs: [], dissent: [], explanation: 'All active sources agree.' };

  const conflictingPairs: string[] = [];
  const dissent: string[] = [];
  for (const [src, mode] of active) {
    if (mode !== input.blendedMode) {
      dissent.push(`${src} recommends ${mode}`);
    }
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (active[i][1] !== active[j][1]) conflictingPairs.push(`${active[i][0]}↔${active[j][0]}`);
    }
  }

  // Severity based on unique modes + weight of dissenting sources
  const dissentingWeight = active.filter(([, m]) => m !== input.blendedMode).reduce((s, [src]) => s + (input.adjustedWeights[src] ?? 0), 0);
  let severity: ConflictSeverity;
  if      (uniqueModes.length >= 3 || dissentingWeight > 0.5) severity = 'severe';
  else if (dissentingWeight > 0.30)                           severity = 'moderate';
  else                                                         severity = 'mild';

  const explanation = `${uniqueModes.length} modes recommended (${uniqueModes.join(', ')}). Dissenting weight: ${(dissentingWeight * 100).toFixed(0)}%. Conflicts: ${conflictingPairs.join(', ')}.`;
  return { severity, conflictingPairs, dissent, explanation };
}

// ── 6. Episode recorder ───────────────────────────────────────────────────
export async function recordStrategicEpisode(input: {
  tenantId:              string;
  cohortKey?:            string;
  conditions:            any;
  sourceRecommendations: SourceRecommendations;
  finalChosenMode:       string;
  blendedMode?:          string | null;
  appliedWeights:        TrustWeights;
}): Promise<string> {
  await connectToDatabase();
  const episodeKey = `episode::${input.tenantId}::${Date.now()}`;

  // Pre-compute sourceCorrectness
  const sourceCorrectness: any = {};
  for (const src of SOURCE_KEYS) {
    const rec = input.sourceRecommendations[src];
    sourceCorrectness[src] = rec != null ? rec === input.finalChosenMode : null;
  }

  await StrategicSourceEpisode.create({
    episodeKey,
    tenantId:  input.tenantId,
    cohortKey: input.cohortKey ?? null,
    conditions: input.conditions,
    sourceRecommendations: input.sourceRecommendations,
    appliedWeights:        input.appliedWeights,
    finalChosenMode:       input.finalChosenMode,
    blendedMode:           input.blendedMode ?? null,
    sourceCorrectness,
  });

  return episodeKey;
}

// ── 7. Trust profile updater (Bayesian-ish) ───────────────────────────────
export async function updateStrategicTrustProfile(input: {
  profileKey:   string;
  scopeLevel:   'tenant' | 'cohort' | 'global';
  tenantId?:    string;
  cohortKey?:   string;
  recentEpisodes: any[];  // pass already-fetched episodes for efficiency
}): Promise<any> {
  await connectToDatabase();

  const reliability = scoreStrategicSourceReliability(input.recentEpisodes);

  // Load or create profile
  let profile = await StrategicTrustProfile.findOne({ profileKey: input.profileKey }).lean() as any;
  if (!profile) {
    profile = await StrategicTrustProfile.create({
      profileKey: input.profileKey,
      scopeLevel: input.scopeLevel,
      tenantId:   input.tenantId   ?? null,
      cohortKey:  input.cohortKey  ?? null,
    });
    profile = profile.toObject?.() ?? profile;
  }

  const current = profile.trustWeights as TrustWeights;
  const LEARNING_RATE = 0.15; // how fast weights shift per update

  // Pull weights toward reliability scores (soft Bayesian update)
  const updated: any = {};
  for (const src of SOURCE_KEYS) {
    // Ideal weight = reliability^2 (amplifies high reliability, suppresses low)
    const ideal = reliability[src] ** 2;
    updated[src] = clamp(current[src] + LEARNING_RATE * (ideal - current[src]), 0.05, 0.70);
  }

  // Normalize to sum=1.0
  const total = Object.values(updated).reduce((a: number, b: number) => a + b, 0) || 1;
  for (const src of SOURCE_KEYS) updated[src] = +(updated[src] / total).toFixed(4);

  // Confidence grows with support count (sigmoid-ish)
  const newSupport    = profile.supportCount + input.recentEpisodes.length;
  const newConfidence = clamp(newSupport / (newSupport + 10), 0, 0.95);

  await StrategicTrustProfile.findOneAndUpdate(
    { profileKey: input.profileKey },
    { trustWeights: updated, reliabilityScores: reliability, confidence: newConfidence, supportCount: newSupport, status: 'active' },
    { upsert: true, new: true }
  );

  return { profileKey: input.profileKey, previous: current, updated, reliability, confidence: newConfidence };
}

// ── 8. Full trainer cycle ─────────────────────────────────────────────────
export async function runStrategicInstinctTrainer(input: {
  tenantId:              string;
  cohortKey?:            string;
  sourceRecommendations: SourceRecommendations;
  conditions:            { instabilityScore: number; forecastPressure: number; volatilityScore?: number; cohortDriftScore?: number; replayDisagreement?: number };
  finalChosenMode:       string;
  recordEpisode?:        boolean;  // default true
}): Promise<any> {
  await connectToDatabase();

  const profileKey = input.tenantId ? `trust::tenant::${input.tenantId}` : `trust::cohort::${input.cohortKey ?? 'global'}`;

  // Load recent episodes for this tenant
  const recentEpisodes = await StrategicSourceEpisode.find({ tenantId: input.tenantId }).sort({ createdAt: -1 }).limit(30).lean() as any[];
  const localDataDepth = recentEpisodes.length;

  // Load or get profile
  let profile = await StrategicTrustProfile.findOne({ profileKey }).lean() as any;
  if (!profile) {
    await StrategicTrustProfile.create({ profileKey, scopeLevel: 'tenant', tenantId: input.tenantId, cohortKey: input.cohortKey ?? null });
    profile = await StrategicTrustProfile.findOne({ profileKey }).lean() as any;
  }

  const baseWeights    = profile.trustWeights as TrustWeights;
  const contextMults   = computeContextMultiplier({ ...input.conditions, localDataDepth }, profile.contextMultipliers);
  const reliability    = scoreStrategicSourceReliability(recentEpisodes);
  const adjustedWeights= computeAdjustedTrustWeights(baseWeights, contextMults, reliability);

  const blendResult    = blendStrategicRecommendations({ sourceRecommendations: input.sourceRecommendations, adjustedWeights });
  const contradiction  = analyzeStrategicContradiction({ sourceRecommendations: input.sourceRecommendations, adjustedWeights, blendedMode: blendResult.blendedMode });

  // Record episode (async — does not block the recommendation)
  let episodeKey: string | null = null;
  if (input.recordEpisode !== false) {
    episodeKey = await recordStrategicEpisode({
      tenantId:              input.tenantId,
      cohortKey:             input.cohortKey,
      conditions:            { ...input.conditions, localDataDepth },
      sourceRecommendations: input.sourceRecommendations,
      finalChosenMode:       input.finalChosenMode,
      blendedMode:           blendResult.blendedMode,
      appliedWeights:        adjustedWeights,
    });
  }

  // Update trust profile weights if we have >= 5 episodes
  let profileUpdate = null;
  if (recentEpisodes.length >= 5) {
    profileUpdate = await updateStrategicTrustProfile({ profileKey, scopeLevel: 'tenant', tenantId: input.tenantId, cohortKey: input.cohortKey, recentEpisodes });
  }

  return {
    profileKey,
    baseWeights,
    contextMultipliers: contextMults,
    adjustedWeights,
    reliability,
    blendResult,
    contradiction,
    episodeKey,
    profileUpdated: !!profileUpdate,
    conditions: { ...input.conditions, localDataDepth },
    // The blended recommendation (advisory — final choice governed by strategy board)
    advisory: {
      blendedMode:    blendResult.blendedMode,
      modeScores:     blendResult.modeScores,
      conflictLevel:  contradiction.severity,
      trustConfidence:+(profile.confidence ?? 0.5).toFixed(3),
    },
  };
}

// ── Feedback recorder (call after outcome is known) ───────────────────────
export async function recordInstinctOutcome(input: {
  episodeKey:       string;
  successScore:     number;
  costAvoided?:     number;
  downtimePrevented?:number;
  harmRate?:        number;
  rollbackRate?:    number;
}): Promise<{ ok: boolean }> {
  await connectToDatabase();
  await StrategicSourceEpisode.findOneAndUpdate(
    { episodeKey: input.episodeKey },
    { outcomes: { successScore: input.successScore, costAvoided: input.costAvoided ?? 0, downtimePrevented: input.downtimePrevented ?? 0, harmRate: input.harmRate ?? 0, rollbackRate: input.rollbackRate ?? 0, outcomeRecorded: true } }
  );
  return { ok: true };
}

/**
 * lib/system/runRegretDrivenTrustTraining.ts
 *
 * Regret-Driven Trust Training — 8 exports.
 *
 *   buildStrategicCounterfactuals      structures per-source estimates into comparable records
 *   selectBestStrategicCounterfactual  ranks sources by estimatedScore × max(0.25, confidence)
 *   calculateStrategicRegret           adjusted regret = rawRegret × max(0.3, confidence) → severity
 *   updateStrategicTrustFromRegret     bounded step: penalize chosen, reward counterfactual winner
 *   analyzeStrategicSourceContradictions flags unanimous vs divergent vs highly-contradicted states
 *   blendStrategicSources             weighted blend using score × weight per source → mode ranking
 *   runStrategicInstinctTrainingCycle  full feedback loop: evaluate → regret → update → persist
 *   getRegretHistory                  returns recent regret events for a tenant (for UI)
 *
 * TWO TRUST UPDATE PATHS (complementary, both run):
 *   Path A (Bayesian, in runStrategicInstinctTrainer.ts): hitRate × quality → ideal weight → soft pull
 *   Path B (Regret, this file): regret event → direct step penalty/reward → bounded shift
 *   Path A learns from aggregate history. Path B corrects immediately from a costly specific decision.
 *
 * DESIGN RULE: Never let any source weight reach 0. Never let one source dominate permanently.
 *               weight clamped 0.05–0.70 per source. Max step per regret event: 0.06 (6%).
 */
import connectToDatabase           from '@/lib/mongodb';
import { StrategicRegretEvent, StrategicCounterfactualRecord } from '@/models/system/StrategicRegret';
import { StrategicTrustProfile }   from '@/models/system/StrategicInstinct';
import { conditionBand }           from './runStrategicMemoryEngine';

const SOURCE_KEYS = ['liveSignals', 'strategicMemory', 'simulation', 'crossTenant'] as const;
type SourceKey    = typeof SOURCE_KEYS[number];
type TrustWeights = Record<SourceKey, number>;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, +n.toFixed(4)));

// ── 1. Build counterfactuals ──────────────────────────────────────────────
export function buildStrategicCounterfactuals(input: {
  sourceRecommendations: Partial<Record<SourceKey, string | null>>;
  sourceEstimatedScores: Partial<Record<SourceKey, { score: number; confidence: number }>>;
}): Record<SourceKey, { suggestedMode: string | null; estimatedOutcomeScore: number; confidence: number }> {
  const result: any = {};
  for (const src of SOURCE_KEYS) {
    result[src] = {
      suggestedMode:       input.sourceRecommendations[src] ?? null,
      estimatedOutcomeScore: input.sourceEstimatedScores[src]?.score       ?? 0,
      confidence:            input.sourceEstimatedScores[src]?.confidence   ?? 0,
    };
  }
  return result;
}

// ── 2. Best counterfactual selector ──────────────────────────────────────
// Ranks by estimatedScore × max(0.25, confidence) — confidence floor prevents
// zero-confidence sources from being completely invisible in ranking.
export function selectBestStrategicCounterfactual(input: {
  evaluatedSources: Record<string, { suggestedMode: string | null; estimatedOutcomeScore: number; confidence: number }>;
}): { source: string; mode: string | null; weightedScore: number; rawScore: number; confidence: number } | null {
  const ranked = Object.entries(input.evaluatedSources)
    .filter(([, v]) => !!v.suggestedMode)
    .map(([source, v]) => ({
      source,
      mode:         v.suggestedMode,
      weightedScore:+(v.estimatedOutcomeScore * Math.max(0.25, v.confidence)).toFixed(4),
      rawScore:      v.estimatedOutcomeScore,
      confidence:    v.confidence,
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore);
  return ranked[0] ?? null;
}

// ── 3. Regret calculator ──────────────────────────────────────────────────
// adjustedRegret = rawRegret × max(0.3, confidence)
// Severity by numeric threshold (not text buckets) — matches trust update math.
export function calculateStrategicRegret(input: {
  actualOutcomeScore:      number;
  bestCounterfactualScore: number;
  counterfactualConfidence:number;
}): { regret: number; rawRegret: number; severity: 'low' | 'medium' | 'high' } {
  const rawRegret    = Math.max(0, input.bestCounterfactualScore - input.actualOutcomeScore);
  const adjustedRegret = rawRegret * Math.max(0.3, input.counterfactualConfidence);
  const severity: 'low' | 'medium' | 'high' = adjustedRegret >= 0.20 ? 'high' : adjustedRegret >= 0.08 ? 'medium' : 'low';
  return { regret: +adjustedRegret.toFixed(4), rawRegret: +rawRegret.toFixed(4), severity };
}

// ── 4. Trust weight updater from regret ──────────────────────────────────
// step = clamp(regret × confidence, 0.005, 0.06) — max 6% shift per event
// chosenSource weight -= step (penalized) | bestCounterfactual weight += step (rewarded)
// Re-normalized to sum=1.0 after update. All weights clamped [0.05, 0.70].
export function updateStrategicTrustFromRegret(input: {
  currentWeights:           TrustWeights;
  chosenSource:             SourceKey;
  bestCounterfactualSource: SourceKey | null;
  regret:                   number;
  counterfactualConfidence: number;
}): { weights: TrustWeights; stepApplied: number; changed: boolean } {
  if (!input.bestCounterfactualSource || input.bestCounterfactualSource === input.chosenSource) {
    return { weights: input.currentWeights, stepApplied: 0, changed: false };
  }

  const next = { ...input.currentWeights };
  const step = clamp(input.regret * input.counterfactualConfidence, 0.005, 0.06);

  next[input.chosenSource]             = clamp(next[input.chosenSource]             - step, 0.05, 0.70);
  next[input.bestCounterfactualSource] = clamp(next[input.bestCounterfactualSource] + step, 0.05, 0.70);

  // Renormalize
  const total = SOURCE_KEYS.reduce((s, k) => s + next[k], 0) || 1;
  const normalized: TrustWeights = {} as any;
  for (const k of SOURCE_KEYS) normalized[k] = clamp(next[k] / total, 0.05, 0.70);

  return { weights: normalized, stepApplied: +step.toFixed(4), changed: true };
}

// ── 5. Source contradiction analyzer ─────────────────────────────────────
export function analyzeStrategicSourceContradictions(input: {
  sourceRecommendations: Partial<Record<SourceKey, string | null>>;
}): { contradictionCount: number; unanimous: boolean; highlyContradicted: boolean; uniqueModes: string[] } {
  const values   = Object.values(input.sourceRecommendations).filter(Boolean) as string[];
  const unique   = [...new Set(values)];
  return {
    contradictionCount:  Math.max(0, unique.length - 1),
    unanimous:           unique.length <= 1,
    highlyContradicted:  unique.length >= 3,
    uniqueModes:         unique,
  };
}

// ── 6. Strategic source blend (score × weight) ─────────────────────────
// Each source contributes its recommendation WEIGHTED by its score × trust weight.
// For sources without a score, treat score=0.5 (neutral participation).
export function blendStrategicSources(input: {
  weights:    TrustWeights;
  sourceScores: Partial<Record<SourceKey, { mode: string; score: number } | null>>;
}): { recommendedMode: string | null; rankings: Array<{ mode: string; score: number }> } {
  const totals: Record<string, number> = {};

  for (const src of SOURCE_KEYS) {
    const payload = input.sourceScores[src];
    if (!payload?.mode) continue;
    const w = input.weights[src] ?? 0;
    totals[payload.mode] = (totals[payload.mode] ?? 0) + (payload.score * w);
  }

  const rankings = Object.entries(totals)
    .map(([mode, score]) => ({ mode, score: +score.toFixed(4) }))
    .sort((a, b) => b.score - a.score);

  return { recommendedMode: rankings[0]?.mode ?? null, rankings };
}

// ── 7. Full regret-driven training cycle ─────────────────────────────────
export async function runStrategicInstinctTrainingCycle(input: {
  tenantId:          string;
  cohortKey?:        string | null;
  episodeKey:        string;
  conditions:        { instabilityScore: number; forecastPressure: number; governanceLoad?: number; volatilityScore?: number };
  chosenSource:      SourceKey;
  chosenMode:        string;
  actualOutcomeScore:number;
  evaluatedSources:  Record<string, { suggestedMode: string | null; estimatedOutcomeScore: number; confidence: number }>;
  currentWeights?:   TrustWeights;  // if not provided, loaded from DB
}): Promise<{ regretEvent: any; trustUpdate: any; newWeights: TrustWeights; profileKey: string }> {
  await connectToDatabase();

  const profileKey = `trust::tenant::${input.tenantId}`;

  // Skip if this episode already has a trust update applied
  const existing = await StrategicRegretEvent.findOne({ episodeKey: input.episodeKey, trustUpdateApplied: true }).lean();
  if (existing) return { regretEvent: existing, trustUpdate: null, newWeights: input.currentWeights!, profileKey };

  // Load trust profile if weights not provided
  let currentWeights: TrustWeights;
  if (input.currentWeights) {
    currentWeights = input.currentWeights;
  } else {
    const profile = await StrategicTrustProfile.findOne({ profileKey }).lean() as any;
    currentWeights = profile?.trustWeights ?? { liveSignals: 0.40, strategicMemory: 0.20, simulation: 0.20, crossTenant: 0.20 };
  }

  // Find best counterfactual
  const best = selectBestStrategicCounterfactual({ evaluatedSources: input.evaluatedSources });

  // Compute regret
  const regretCalc = calculateStrategicRegret({
    actualOutcomeScore:      input.actualOutcomeScore,
    bestCounterfactualScore: best?.rawScore ?? input.actualOutcomeScore,
    counterfactualConfidence:best?.confidence ?? 0.3,
  });

  // Compute trust update from regret
  const trustUpdate = updateStrategicTrustFromRegret({
    currentWeights,
    chosenSource:             input.chosenSource,
    bestCounterfactualSource: (best?.source as SourceKey | null) ?? null,
    regret:                   regretCalc.regret,
    counterfactualConfidence: best?.confidence ?? 0.3,
  });

  // Persist counterfactual record
  const recordKey = `cf::${input.episodeKey}`;
  await StrategicCounterfactualRecord.findOneAndUpdate(
    { recordKey },
    { recordKey, tenantId: input.tenantId, episodeKey: input.episodeKey, evaluatedSources: input.evaluatedSources, selectedBestSource: best?.source ?? null, selectedBestScore: best?.rawScore ?? 0, selectedBestConfidence: best?.confidence ?? 0 },
    { upsert: true, new: true }
  );

  // Persist regret event
  const regretKey = `regret::${input.episodeKey}`;
  const regretEvent = await StrategicRegretEvent.findOneAndUpdate(
    { regretKey },
    {
      regretKey, tenantId: input.tenantId, cohortKey: input.cohortKey ?? null,
      episodeKey: input.episodeKey,
      contextBands: {
        instabilityBand:     conditionBand(input.conditions.instabilityScore),
        forecastPressureBand:conditionBand(input.conditions.forecastPressure),
        governanceLoadBand:  conditionBand(input.conditions.governanceLoad ?? 0),
        volatilityBand:      conditionBand(input.conditions.volatilityScore ?? 0),
      },
      chosenSource: input.chosenSource, chosenMode: input.chosenMode,
      actualOutcomeScore: input.actualOutcomeScore,
      bestCounterfactualSource: best?.source ?? null,
      bestCounterfactualMode:   best?.mode   ?? null,
      bestCounterfactualScore:  best?.rawScore ?? 0,
      regret:                   regretCalc.regret,
      rawRegret:                regretCalc.rawRegret,
      counterfactualConfidence: best?.confidence ?? 0.3,
      severity:                 regretCalc.severity,
      appliedDelta: {
        penalizedSource: trustUpdate.changed ? input.chosenSource : null,
        rewardedSource:  trustUpdate.changed ? (best?.source ?? null) : null,
        stepSize:        trustUpdate.stepApplied,
      },
      trustUpdateApplied: trustUpdate.changed,
    },
    { upsert: true, new: true }
  );

  // Apply trust weight update to DB profile (only on meaningful regret)
  if (trustUpdate.changed && regretCalc.severity !== 'low') {
    await StrategicTrustProfile.findOneAndUpdate(
      { profileKey },
      { trustWeights: trustUpdate.weights, updatedAt: new Date() },
      { upsert: true }
    );
  }

  return { regretEvent: regretEvent.toObject?.() ?? regretEvent, trustUpdate, newWeights: trustUpdate.weights, profileKey };
}

// ── 8. Regret history reader ──────────────────────────────────────────────
export async function getRegretHistory(input: { tenantId: string; limit?: number }): Promise<{ events: any[]; summary: { totalEvents: number; highSeverity: number; mostPenalized: string | null; mostRewarded: string | null; avgRegret: number } }> {
  await connectToDatabase();
  const events = await StrategicRegretEvent.find({ tenantId: input.tenantId }).sort({ createdAt: -1 }).limit(input.limit ?? 20).lean() as any[];

  const penalizedCounts: Record<string, number> = {};
  const rewardedCounts:  Record<string, number> = {};
  for (const ev of events) {
    if (ev.appliedDelta?.penalizedSource) penalizedCounts[ev.appliedDelta.penalizedSource] = (penalizedCounts[ev.appliedDelta.penalizedSource] ?? 0) + 1;
    if (ev.appliedDelta?.rewardedSource)  rewardedCounts[ev.appliedDelta.rewardedSource]   = (rewardedCounts[ev.appliedDelta.rewardedSource]   ?? 0) + 1;
  }

  const mostPenalized = Object.entries(penalizedCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  const mostRewarded  = Object.entries(rewardedCounts).sort(([, a], [, b]) => b - a)[0]?.[0]  ?? null;
  const avgRegret     = events.length > 0 ? +(events.reduce((s, e) => s + (e.regret ?? 0), 0) / events.length).toFixed(4) : 0;

  return {
    events,
    summary: { totalEvents: events.length, highSeverity: events.filter(e => e.severity === 'high').length, mostPenalized, mostRewarded, avgRegret },
  };
}

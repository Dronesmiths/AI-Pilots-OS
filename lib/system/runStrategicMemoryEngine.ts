/**
 * lib/system/runStrategicMemoryEngine.ts
 *
 * Strategic Memory Engine — 8 exports.
 *
 *   conditionBand                 maps a numeric value to a named band (very_low/low/medium/high)
 *   openStrategicPostureEpisode   creates + persists a new posture period
 *   closeStrategicPostureEpisode  closes an episode with final outcomes, computes successScore
 *   extractStrategicMemories      groups closed episodes into typed memory patterns with full outcome avgs
 *   scoreStrategicMemory          confidence score for a memory record
 *   recallStrategicMemory         finds best matching memory for current conditions (DB-backed)
 *   evaluateStrategicMemoryDrift  aging/suppression logic per memory
 *   runStrategicMemoryCycle       full orchestrator: query → extract → score → persist → drift → recall
 *
 * RULE: Strategic memory guides strategy, not fossilizes it.
 *       Memories decay with drift. They never override live safety or governance.
 *       Memory is the fourth input to autopilot — behind override, policy, live signals.
 */
import connectToDatabase            from '@/lib/mongodb';
import { StrategicMemoryRecord, StrategicPostureEpisode } from '@/models/system/StrategicMemory';
import type { ModeName }            from '@/models/system/OperatingMode';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, +n.toFixed(3)));

// ── 1. Condition banding (pure) ───────────────────────────────────────────
export function conditionBand(value: number, cuts: [number, number, number] = [20, 45, 70]): string {
  if (value >= cuts[2]) return 'high';
  if (value >= cuts[1]) return 'medium';
  if (value >= cuts[0]) return 'low';
  return 'very_low';
}

// ── 2. Open posture episode ───────────────────────────────────────────────
export async function openStrategicPostureEpisode(input: {
  tenantId:          string;
  cohortKey?:        string | null;
  modeName:          ModeName;
  previousMode?:     string | null;
  conditionsAtStart: { instabilityScore: number; forecastPressure: number; governanceLoad: number; harmRate: number };
}): Promise<string> {
  await connectToDatabase();
  // Close any unclosed episode for this tenant first (prevents orphans)
  await StrategicPostureEpisode.updateMany(
    { tenantId: input.tenantId, endedAt: null, modeName: { $ne: input.modeName } },
    { endedAt: new Date() }
  );
  const episodeKey = `ep::${input.tenantId}::${input.modeName}::${Date.now()}`;
  await StrategicPostureEpisode.create({
    episodeKey,
    tenantId:   input.tenantId,
    cohortKey:  input.cohortKey ?? null,
    modeName:   input.modeName,
    previousMode: input.previousMode ?? null,
    startedAt:  new Date(),
    conditionsAtStart: input.conditionsAtStart,
  });
  return episodeKey;
}

// ── 3. Close posture episode ──────────────────────────────────────────────
export async function closeStrategicPostureEpisode(input: {
  episodeKey: string;
  outcomes:   { costAvoided: number; downtimePrevented: number; governanceLoad: number; harmRate: number; rollbackRate: number; incidentRate: number; preventionSuccessRate: number; recoveryEfficiency: number };
  optimalWindowMs?: number;  // for timing score computation
}): Promise<{ successScore: number; durationMinutes: number; timingScore: number | null }> {
  await connectToDatabase();
  const ep = await StrategicPostureEpisode.findOne({ episodeKey: input.episodeKey }).lean() as any;
  if (!ep) throw new Error(`Episode ${input.episodeKey} not found`);

  const durationMs     = Date.now() - new Date(ep.startedAt).getTime();
  const durationMinutes = +(durationMs / 60000).toFixed(1);

  // successScore: positive outcomes minus negative
  const s = input.outcomes;
  const successScore = clamp(
    (s.preventionSuccessRate * 0.3 + s.recoveryEfficiency * 0.2 + (s.costAvoided / 100) * 0.2 + (s.downtimePrevented / 100) * 0.15)
    - (s.harmRate * 0.5 + s.rollbackRate * 0.4 + s.incidentRate * 0.3),
    0, 1
  );

  // Timing score: how close was duration to optimal window?
  let timingScore: number | null = null;
  if (input.optimalWindowMs) {
    const delta = Math.abs(durationMs - input.optimalWindowMs);
    timingScore = clamp(1 - delta / input.optimalWindowMs, 0, 1);
  }

  await StrategicPostureEpisode.findOneAndUpdate(
    { episodeKey: input.episodeKey },
    { endedAt: new Date(), outcomes: input.outcomes, successScore, durationMinutes, timingScore }
  );

  return { successScore, durationMinutes, timingScore };
}

// ── 4. Memory extraction ──────────────────────────────────────────────────
type ExtractedMemory = {
  memoryKey:      string;
  memoryType:     string;
  scopeLevel:     string;
  tenantId?:      string | null;
  cohortKey?:     string | null;
  triggerContext: any;
  posturePattern: any;
  supportCount:   number;
  avgOutcomes:    any;
};

export function extractStrategicMemories(input: {
  episodes: any[];
  scopeLevel?: 'tenant' | 'cohort';
}): ExtractedMemory[] {
  const scope = input.scopeLevel ?? 'tenant';
  const grouped: Record<string, any[]> = {};

  for (const ep of input.episodes) {
    if (!ep.endedAt) continue;  // skip open episodes
    const instBand  = conditionBand(ep.conditionsAtStart?.instabilityScore ?? 0);
    const fpBand    = conditionBand(ep.conditionsAtStart?.forecastPressure  ?? 0);
    const govBand   = conditionBand(ep.conditionsAtStart?.governanceLoad    ?? 0);
    const harmBand  = conditionBand((ep.conditionsAtStart?.harmRate ?? 0) * 100, [5, 12, 20]);

    const key = [
      scope === 'cohort' ? (ep.cohortKey ?? ep.tenantId) : ep.tenantId,
      ep.modeName,
      ep.previousMode ?? 'none',
      instBand, fpBand, govBand, harmBand,
    ].join('::');

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(ep);
  }

  return Object.entries(grouped).map(([key, eps]) => {
    const avg = (vals: number[]) => vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : 0;
    const hasPrevious = eps[0].previousMode && eps[0].previousMode !== 'none';
    const avgSuccess  = avg(eps.map(e => e.successScore ?? 0));
    const avgHarm     = avg(eps.map(e => e.outcomes?.harmRate ?? 0));

    // Classify memory type
    let memoryType: string;
    if (hasPrevious)          memoryType = 'transition_pattern';
    else if (avgSuccess < 0.35 || avgHarm > 0.2) memoryType = 'failure_pattern';
    else if (eps[0].conditionsAtStart?.instabilityScore > 60 || eps[0].conditionsAtStart?.forecastPressure > 60) memoryType = 'pressure_conditioned_pattern';
    else if (avg(eps.map(e => (e.outcomes?.costAvoided ?? 0) + (e.outcomes?.downtimePrevented ?? 0))) > 60) memoryType = 'economic_pattern';
    else memoryType = 'mode_baseline';

    const parts   = key.split('::');
    const idPart  = parts[0];
    const modePart= parts[1];
    const prevPart= parts[2];

    return {
      memoryKey:    `mem::${key}`,
      memoryType,
      scopeLevel:   scope,
      tenantId:     scope === 'tenant' ? idPart : null,
      cohortKey:    scope === 'cohort' ? idPart : (eps[0].cohortKey ?? null),
      triggerContext:{
        instabilityBand:     parts[3] ?? '*',
        forecastPressureBand:parts[4] ?? '*',
        governanceLoadBand:  parts[5] ?? '*',
        harmRateBand:        parts[6] ?? '*',
      },
      posturePattern: {
        winningMode: modePart,
        fromMode:    hasPrevious ? prevPart : null,
        toMode:      hasPrevious ? modePart : null,
      },
      supportCount: eps.length,
      avgOutcomes: {
        avgCostAvoided:       avg(eps.map(e => e.outcomes?.costAvoided ?? 0)),
        avgDowntimePrevented: avg(eps.map(e => e.outcomes?.downtimePrevented ?? 0)),
        avgGovernanceLoad:    avg(eps.map(e => e.outcomes?.governanceLoad ?? 0)),
        avgHarmRate:          avgHarm,
        avgRollbackRate:      avg(eps.map(e => e.outcomes?.rollbackRate ?? 0)),
        avgStabilityGain:     avgSuccess,
        avgROI:               avg(eps.map(e => (e.outcomes?.costAvoided ?? 0) / Math.max(e.outcomes?.governanceLoad ?? 1, 1))),
      },
    };
  });
}

// ── 5. Memory scorer ──────────────────────────────────────────────────────
export function scoreStrategicMemory(input: {
  supportCount:    number;
  avgROI:          number;
  avgStabilityGain:number;
  avgHarmRate:     number;
  avgRollbackRate: number;
  recencyWeight:   number;
  driftPenalty:    number;
}): number {
  let score = 0;
  score += Math.min(input.supportCount / 20, 1)                    * 0.25;
  score += clamp(input.avgROI / 10, 0, 1)                          * 0.20;
  score += clamp(input.avgStabilityGain, 0, 1)                     * 0.20;
  score += Math.max(0, 1 - input.avgHarmRate)                      * 0.15;
  score += Math.max(0, 1 - input.avgRollbackRate)                  * 0.10;
  score += input.recencyWeight                                      * 0.10;
  score -= input.driftPenalty                                       * 0.20;
  return clamp(score, 0, 1);
}

// ── 6. Strategic recall (DB-backed) ──────────────────────────────────────
export async function recallStrategicMemory(input: {
  tenantId?:           string;
  cohortKey?:          string;
  instabilityScore:    number;
  forecastPressure:    number;
  governanceLoad?:     number;
  harmRate?:           number;
  preferMemoryType?:   string;
}): Promise<{ memory: any | null; matchScore: number; explanation: string }> {
  await connectToDatabase();
  const instBand  = conditionBand(input.instabilityScore);
  const fpBand    = conditionBand(input.forecastPressure);
  const govBand   = conditionBand(input.governanceLoad ?? 0);
  const harmBand  = conditionBand((input.harmRate ?? 0) * 100, [5, 12, 20]);

  const query: any = { status: 'active' };
  if (input.preferMemoryType) query.memoryType = input.preferMemoryType;
  const memories = await StrategicMemoryRecord.find(query).lean() as any[];

  const scored = memories.map((m: any) => {
    let match = 0;
    if (m.tenantId && m.tenantId === input.tenantId)   match += 0.40;
    else if (m.cohortKey && m.cohortKey === input.cohortKey) match += 0.25;
    if (m.triggerContext.instabilityBand     === instBand || m.triggerContext.instabilityBand === '*') match += 0.15;
    if (m.triggerContext.forecastPressureBand=== fpBand  || m.triggerContext.forecastPressureBand === '*') match += 0.10;
    if (m.triggerContext.governanceLoadBand  === govBand || m.triggerContext.governanceLoadBand === '*') match += 0.05;
    if (m.triggerContext.harmRateBand        === harmBand|| m.triggerContext.harmRateBand === '*') match += 0.05;
    return { memory: m, matchScore: +(match * (m.confidence ?? 0.5)).toFixed(3) };
  }).sort((a, b) => b.matchScore - a.matchScore);

  const best = scored[0] ?? null;
  if (!best || best.matchScore < 0.10) return { memory: null, matchScore: 0, explanation: 'No relevant strategic memory found for current conditions.' };

  const explanation = `Memory matched: ${best.memory.posturePattern.winningMode?.replace(/_/g, '-')} works well under ${best.memory.triggerContext.instabilityBand} instability + ${best.memory.triggerContext.forecastPressureBand} forecast pressure (confidence: ${(best.memory.confidence * 100).toFixed(0)}%, support: ${best.memory.supportCount} episodes).`;
  return { memory: best.memory, matchScore: best.matchScore, explanation };
}

// ── 7. Drift evaluator ────────────────────────────────────────────────────
export function evaluateStrategicMemoryDrift(input: {
  previousCohortKey?:       string | null;
  currentCohortKey?:        string | null;
  recentContradictionRate:  number;  // fraction of recent episodes that contradict this memory
  policyEnvironmentShift:   number;  // 0-1 (how much has policy changed)
  ageMonths?:               number;  // recency decay factor
}): { driftPenalty: number; recencyWeight: number; shouldSuppress: boolean } {
  let driftPenalty = 0;
  if (input.previousCohortKey && input.currentCohortKey && input.previousCohortKey !== input.currentCohortKey) driftPenalty += 0.35;
  driftPenalty += clamp(input.recentContradictionRate, 0, 1) * 0.40;
  driftPenalty += clamp(input.policyEnvironmentShift,  0, 1) * 0.25;

  // Recency decay: 1.0 at 0 months, 0.5 at 6 months, ~0.2 at 18 months
  const ageMonths   = input.ageMonths ?? 0;
  const recencyWeight = clamp(Math.exp(-ageMonths * 0.09), 0.1, 1.0);

  return {
    driftPenalty:   clamp(driftPenalty, 0, 1),
    recencyWeight,
    shouldSuppress: driftPenalty >= 0.65,
  };
}

// ── 8. Full memory cycle orchestrator ─────────────────────────────────────
export async function runStrategicMemoryCycle(input: {
  tenantId:         string;
  cohortKey?:       string | null;
  currentConditions:{ instabilityScore: number; forecastPressure: number; governanceLoad?: number; harmRate?: number };
  lookbackDays?:    number;
}): Promise<any> {
  await connectToDatabase();
  const lookbackMs = (input.lookbackDays ?? 90) * 86_400_000;
  const since      = new Date(Date.now() - lookbackMs);

  // Load closed episodes
  const episodes = await StrategicPostureEpisode.find({
    tenantId: input.tenantId,
    endedAt:  { $ne: null, $gte: since },
  }).sort({ startedAt: -1 }).limit(200).lean() as any[];

  // Extract memory groups
  const extracted = extractStrategicMemories({ episodes, scopeLevel: 'tenant' });

  let created = 0, updated = 0;
  const now = new Date();

  for (const mem of extracted) {
    const ageMonths = 0;  // newly extracted from recent episodes
    const drift     = evaluateStrategicMemoryDrift({ previousCohortKey: input.cohortKey, currentCohortKey: input.cohortKey, recentContradictionRate: 0, policyEnvironmentShift: 0, ageMonths });
    const confidence = scoreStrategicMemory({
      supportCount:    mem.supportCount,
      avgROI:          mem.avgOutcomes.avgROI,
      avgStabilityGain:mem.avgOutcomes.avgStabilityGain,
      avgHarmRate:     mem.avgOutcomes.avgHarmRate,
      avgRollbackRate: mem.avgOutcomes.avgRollbackRate,
      recencyWeight:   drift.recencyWeight,
      driftPenalty:    drift.driftPenalty,
    });

    const summary = `${mem.posturePattern.winningMode?.replace(/_/g, '-')} under ${mem.triggerContext.instabilityBand} instability + ${mem.triggerContext.forecastPressureBand} forecast pressure. Avg stability gain: ${(mem.avgOutcomes.avgStabilityGain * 100).toFixed(0)}%${mem.memoryType === 'failure_pattern' ? ' [⚠ failure pattern]' : ''}.`;

    const existing = await StrategicMemoryRecord.findOne({ memoryKey: mem.memoryKey }).lean();
    if (existing) {
      await StrategicMemoryRecord.findOneAndUpdate({ memoryKey: mem.memoryKey }, {
        ...mem,
        outcomes:  mem.avgOutcomes,
        confidence, driftPenalty: drift.driftPenalty, recencyWeight: drift.recencyWeight,
        status:    drift.shouldSuppress ? 'suppressed' : 'active',
        summary,   updatedAt: now,
      });
      updated++;
    } else {
      await StrategicMemoryRecord.create({ ...mem, outcomes: mem.avgOutcomes, confidence, driftPenalty: drift.driftPenalty, recencyWeight: drift.recencyWeight, status: 'active', summary });
      created++;
    }
  }

  // Drift check on old memories (age them by months elapsed)
  const oldMemories = await StrategicMemoryRecord.find({ tenantId: input.tenantId, status: 'active', updatedAt: { $lt: new Date(Date.now() - 30 * 86_400_000) } }).lean() as any[];
  for (const old of oldMemories) {
    const ageMonths = (Date.now() - new Date(old.updatedAt).getTime()) / (30 * 86_400_000);
    const drift     = evaluateStrategicMemoryDrift({ recentContradictionRate: 0, policyEnvironmentShift: 0, ageMonths });
    if (drift.shouldSuppress || drift.recencyWeight < 0.25) {
      await StrategicMemoryRecord.findOneAndUpdate({ memoryKey: old.memoryKey }, { status: drift.shouldSuppress ? 'suppressed' : 'stale', recencyWeight: drift.recencyWeight, driftPenalty: drift.driftPenalty });
    }
  }

  // Recall best matching memory for current conditions
  const recall = await recallStrategicMemory({ tenantId: input.tenantId, cohortKey: input.cohortKey ?? undefined, ...input.currentConditions });

  return {
    tenantId:          input.tenantId,
    episodesProcessed: episodes.length,
    memoriesCreated:   created,
    memoriesUpdated:   updated,
    memoriesAged:      oldMemories.length,
    totalExtracted:    extracted.length,
    recall,
  };
}

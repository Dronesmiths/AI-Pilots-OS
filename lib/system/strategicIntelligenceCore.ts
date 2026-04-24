/**
 * lib/system/strategicIntelligenceCore.ts
 *
 * The 5 critical strategic intelligence enhancements.
 * These wire into the existing instinct trainer + memory engine flows.
 *
 *   calculateSourceRegret     what would have happened with a different source? (counterfactual)
 *   computeTrustVolatility    variance + stability score for a source's recent outcomes
 *   detectContextCollapse     are we in a situation none of our systems understand?
 *   detectSourceBias          is the system over-relying on one source vs its actual win rate?
 *   evaluateTimingQuality     was the posture switch early/late/on-time?
 *   runIntelligenceDiagnostic full diagnostic combining all 5 into one report
 *
 * INTEGRATION:
 *   - calculateSourceRegret   → called at outcome recording time (recordInstinctOutcome)
 *   - computeTrustVolatility  → called at trust profile update time
 *   - detectContextCollapse   → called at blend time (runStrategicInstinctTrainer)
 *   - detectSourceBias        → called at profile update time
 *   - evaluateTimingQuality   → called at episode close time (closeStrategicPostureEpisode)
 */
import connectToDatabase from '@/lib/mongodb';
import { StrategicSourceEpisode } from '@/models/system/StrategicInstinct';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, +n.toFixed(4)));

// ── 1. Source Regret Engine ────────────────────────────────────────────────
// "What would have happened if we had trusted a different source?"
// regret = max(counterfactual outcomes) - actual outcome
export function calculateSourceRegret(input: {
  actualOutcome:    number;
  counterfactuals:  Array<{ source: string; estimatedOutcome: number }>;
}): {
  regret:      number;
  bestSource:  string | null;
  opportunity: string;   // human-readable missed opportunity description
} {
  if (input.counterfactuals.length === 0) return { regret: 0, bestSource: null, opportunity: 'No counterfactuals provided.' };

  const sorted  = [...input.counterfactuals].sort((a, b) => b.estimatedOutcome - a.estimatedOutcome);
  const best    = sorted[0];
  const regret  = clamp(best.estimatedOutcome - input.actualOutcome, 0, 1);

  const opportunity =
    regret < 0.05 ? 'Negligible regret — actual outcome was near-optimal.'
    : regret < 0.15 ? `Minor opportunity cost vs ${best.source} (Δ${(regret * 100).toFixed(0)}%).`
    : regret < 0.30 ? `Moderate regret — ${best.source} would likely have outperformed by ${(regret * 100).toFixed(0)}%.`
    : `High regret — ${best.source} would likely have produced ${(regret * 100).toFixed(0)}% better outcome.`;

  return { regret, bestSource: best.source, opportunity };
}

// ── 2. Trust Volatility Tracker ───────────────────────────────────────────
// A source that performs well on average but unstably is less trustworthy than it looks.
export function computeTrustVolatility(scores: number[]): {
  mean:        number;
  volatility:  number;    // standard deviation
  stable:      boolean;   // volatility < 0.15 → stable enough to over-index on
  warning:     string | null;
} {
  if (scores.length < 2) return { mean: scores[0] ?? 0.5, volatility: 0, stable: true, warning: null };
  const mean     = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const vol      = Math.sqrt(variance);

  const warning =
    vol > 0.30 ? `High volatility (σ=${vol.toFixed(2)}) — source performs inconsistently. Reduce trust weight.`
    : vol > 0.15 ? `Moderate volatility (σ=${vol.toFixed(2)}) — treat source confidence with caution.`
    : null;

  return { mean: +mean.toFixed(3), volatility: +vol.toFixed(3), stable: vol < 0.15, warning };
}

// ── 3. Context Collapse Detector ─────────────────────────────────────────
// "Are we in a situation none of our systems have seen before?"
// When context collapses → force exploration mode, lower confidence, escalate.
export function detectContextCollapse(input: {
  memoryMatchScore:       number;   // 0-1, how well past memory matches current conditions
  trustProfileConfidence: number;   // 0-1, how confident we are in trust weights
  sourceAgreementScore:   number;   // 0-1, fraction of sources that agree on same mode
  localEpisodeCount:      number;   // how many episodes do we have for this tenant
}): {
  collapsed:    boolean;
  severity:     'none' | 'warning' | 'critical';
  reason:       string;
  recommendation: string;
} {
  const novelEnvironment = input.memoryMatchScore < 0.30 && input.trustProfileConfidence < 0.40 && input.sourceAgreementScore < 0.30;
  const thinData         = input.localEpisodeCount < 3;
  const highDisagreement = input.sourceAgreementScore < 0.20;

  if (novelEnvironment) return { collapsed: true, severity: 'critical', reason: 'novel_environment', recommendation: 'Force balanced or conservative posture. Escalate all mode changes for approval. Disable auto-switch.' };
  if (thinData && highDisagreement) return { collapsed: true, severity: 'warning', reason: 'thin_data_high_disagreement', recommendation: 'Increase cross-tenant weight. Require approval for aggressive or recovery shifts.' };
  if (highDisagreement) return { collapsed: false, severity: 'warning', reason: 'source_disagreement', recommendation: 'Use conservative blend. Reduce confidence by 20% on autopilot recommendation.' };
  return { collapsed: false, severity: 'none', reason: 'normal', recommendation: '' };
}

// ── 4. Strategic Bias Corrector ───────────────────────────────────────────
// "Is the system over-relying on one source beyond its actual win rate?"
// usageRate = how often this source's recommendation was chosen
// winRate   = how often choosing it correlated with good outcomes
export function detectSourceBias(input: {
  source:     string;
  usageRate:  number;   // 0-1, fraction of decisions where this source's mode was chosen
  winRate:    number;   // 0-1, fraction of those where outcome was above average
}): {
  bias:        number;
  overTrusted: boolean;
  underTrusted:boolean;
  suggestion:  string;
} {
  const bias = +(input.usageRate - input.winRate).toFixed(3);

  if (bias > 0.20)  return { bias, overTrusted: true, underTrusted: false, suggestion: `${input.source} is used ${(input.usageRate * 100).toFixed(0)}% of the time but only wins ${(input.winRate * 100).toFixed(0)}% — reduce trust weight by ~${(bias * 50).toFixed(0)}%.` };
  if (bias < -0.15) return { bias, overTrusted: false, underTrusted: true, suggestion: `${input.source} wins more than it's used — consider increasing trust weight.` };
  return { bias, overTrusted: false, underTrusted: false, suggestion: `${input.source} bias is within acceptable range.` };
}

// ── 5. Timing Quality Evaluator ───────────────────────────────────────────
// "Was the posture switch early, late, or optimal?"
// Called when closing a posture episode to compute timing score.
export function evaluateTimingQuality(input: {
  actualDurationMs:  number;   // how long the mode ran before being switched
  optimalWindowMs:   number;   // historically optimal duration for this mode+context
  instabilityAtSwitch?: number;  // instability when switch happened
}): {
  timingError:    number;   // absolute ms difference from optimal
  timingScore:    number;   // 0-1 (1 = perfect timing)
  verdict:        'early' | 'optimal' | 'late';
  suggestion:     string;
} {
  const delta = input.actualDurationMs - input.optimalWindowMs;
  const absDelta = Math.abs(delta);
  const timingScore = clamp(1 - absDelta / input.optimalWindowMs, 0, 1);

  // Allow 20% window around optimal before flagging
  const tolerance = input.optimalWindowMs * 0.20;
  let verdict: 'early' | 'optimal' | 'late';
  if (delta < -tolerance)     verdict = 'early';
  else if (delta > tolerance) verdict = 'late';
  else                        verdict = 'optimal';

  const minsEarly = Math.abs(delta) / 60000;
  const suggestion =
    verdict === 'early'   ? `Switch was ${minsEarly.toFixed(0)} min early. Consider entering later — earlier switches may waste prevention budget.`
    : verdict === 'late'  ? `Switch was ${minsEarly.toFixed(0)} min late. Consider earlier trigger — delayed switches increase incident risk.`
    : 'Timing was within optimal window.';

  return { timingError: absDelta, timingScore, verdict, suggestion };
}

// ── 6. Full Intelligence Diagnostic ──────────────────────────────────────
// Combines all 5 into one report for a given tenant
export async function runIntelligenceDiagnostic(input: {
  tenantId:   string;
  conditions: { instabilityScore: number; forecastPressure: number };
}): Promise<any> {
  await connectToDatabase();
  const episodes = await StrategicSourceEpisode.find({ tenantId: input.tenantId, 'outcomes.outcomeRecorded': true }).sort({ createdAt: -1 }).limit(30).lean() as any[];

  const SOURCE_KEYS = ['liveSignals', 'strategicMemory', 'simulation', 'crossTenant'] as const;

  // Compute per-source volatility from recent outcome scores
  const volatility: Record<string, any> = {};
  for (const src of SOURCE_KEYS) {
    const scores = episodes
      .filter(e => e.sourceCorrectness?.[src] != null && e.outcomes?.outcomeRecorded)
      .map(e => e.outcomes?.successScore ?? 0.5);
    volatility[src] = computeTrustVolatility(scores);
  }

  // Compute per-source bias (usage rate vs win rate)
  const bias: Record<string, any> = {};
  for (const src of SOURCE_KEYS) {
    const used      = episodes.filter(e => e.sourceRecommendations?.[src] && e.sourceRecommendations[src] === e.finalChosenMode);
    const wins      = used.filter(e => (e.outcomes?.successScore ?? 0) > 0.60);
    const usageRate = episodes.length > 0 ? used.length / episodes.length : 0;
    const winRate   = used.length > 0 ? wins.length / used.length : 0;
    bias[src] = detectSourceBias({ source: src, usageRate, winRate });
  }

  // Regret analysis on last 5 episodes with counterfactual data
  const regretHistory = episodes.slice(0, 5).map(ep => ({
    episodeKey:    ep.episodeKey,
    finalMode:     ep.finalChosenMode,
    actualOutcome: ep.outcomes?.successScore ?? 0.5,
    regret: calculateSourceRegret({
      actualOutcome: ep.outcomes?.successScore ?? 0.5,
      counterfactuals: SOURCE_KEYS
        .filter(s => ep.sourceRecommendations?.[s] && ep.sourceRecommendations[s] !== ep.finalChosenMode)
        .map(s => ({ source: s, estimatedOutcome: ep.outcomes?.successScore != null ? ep.outcomes.successScore * 1.15 : 0.65 })),
    }),
  }));

  const avgRegret = regretHistory.length > 0 ? regretHistory.reduce((s, r) => s + r.regret.regret, 0) / regretHistory.length : 0;

  return {
    tenantId:         input.tenantId,
    episodesAnalyzed: episodes.length,
    volatility,
    bias,
    regretHistory,
    avgRegret:        +avgRegret.toFixed(3),
    health:           avgRegret < 0.05 ? 'optimal' : avgRegret < 0.15 ? 'good' : avgRegret < 0.25 ? 'fair' : 'degraded',
  };
}

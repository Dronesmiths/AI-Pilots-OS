/**
 * lib/system/runDoctrineSynthesisCouncil.ts
 *
 * Doctrine Synthesis Council — the unified decision resolver.
 * Takes ALL intelligence sources and produces ONE final strategic recommendation
 * with a full authority path and explanation.
 *
 * 7 sub-functions (named exports, compose into runDoctrineSynthesisCouncil):
 *
 *   buildCouncilInputs           normalizes all sources into StrategicPosition[]
 *   applyAuthorityWeights        trust weights + doctrine bias → authorityWeight per position
 *   detectCouncilConflict        unique mode count → conflict level
 *   scoreCouncilDecision         confidence×0.4 + evidence×0.3 + (1-risk)×0.3 × authorityWeight
 *   applyGovernanceConstraints   blocked positions removed; requiresApproval flagged
 *   buildCouncilJustification    who voted for the winner, what competed, why it won
 *   runDoctrineSynthesisCouncil  full orchestrated pipeline → GovernedDecisionEnvelope
 *
 * POSITION WEIGHTING:
 *   liveSignals      = trustWeights.liveSignals (from StrategicTrustProfile)
 *   strategicMemory  = trustWeights.strategicMemory
 *   simulation       = trustWeights.simulation
 *   crossTenant      = trustWeights.crossTenant
 *   doctrine         = 0.30 (doctrine is a governing prior, slightly above normal sources)
 *   autopilot        = 0.35 (autopilot integrates multiple signals — held higher by default)
 *   All weights can be overridden by doctrineBias.
 *
 * MOST IMPORTANT RULE:
 *   The council resolves intelligence — it does NOT replace it.
 *   Operator override (from Constitutional Strategy Board) ALWAYS supersedes council output.
 */

export type StrategicPosition = {
  source:        'liveSignals' | 'strategicMemory' | 'simulation' | 'crossTenant' | 'doctrine' | 'autopilot';
  mode:          string;
  confidence:    number;   // 0-1: how confident is this source in its recommendation
  evidenceScore: number;   // 0-1: quality of underlying evidence
  riskScore:     number;   // 0-1: how risky is following this source's suggestion
  trustWeight?:  number;   // override for initial weight (set by authority engine)
  constraints?:  { requiresApproval?: boolean; blocked?: boolean };
};

export type GovernedDecisionEnvelope = {
  finalMode:           string | null;
  requiresApproval:    boolean;
  conflictLevel:       'low' | 'medium' | 'high';
  rankings:            Array<{ mode: string; score: number }>;
  justification:       { summary: string; topInfluencers: any[]; competingModes: any[]; authorityPath: string; explanationText: string };
  governance:          { overridden: boolean; reason?: string; fallbackMode?: string };
  positionCount:       number;
  timestamp:           string;
};

// ── 1. Normalizer ─────────────────────────────────────────────────────────
export function buildCouncilInputs(sources: Partial<Record<StrategicPosition['source'], Omit<StrategicPosition, 'source'>>>): StrategicPosition[] {
  const keys: StrategicPosition['source'][] = ['liveSignals', 'strategicMemory', 'simulation', 'crossTenant', 'doctrine', 'autopilot'];
  return keys.flatMap(src => {
    const s = sources[src];
    if (!s) return [];
    return [{ source: src, ...s }];
  });
}

// ── 2. Authority weighting ─────────────────────────────────────────────────
const DEFAULT_AUTHORITY: Record<string, number> = {
  autopilot:      0.35,
  doctrine:       0.30,
  liveSignals:    0.25,
  strategicMemory:0.20,
  simulation:     0.20,
  crossTenant:    0.20,
};

export function applyAuthorityWeights(input: {
  positions:     StrategicPosition[];
  trustWeights?: Partial<Record<string, number>>;
  doctrineBias?: { preferredMode?: string | null; boostSource?: string; weightIncrease?: number };
}): Array<StrategicPosition & { authorityWeight: number }> {
  return input.positions.map(p => {
    let weight = input.trustWeights?.[p.source] ?? p.trustWeight ?? DEFAULT_AUTHORITY[p.source] ?? 0.20;

    // Doctrine bias: if this position recommends the doctrine-preferred mode, boost its authority
    if (input.doctrineBias?.preferredMode === p.mode) weight *= 1.15;
    // Explicit source boost from evidence-trust doctrine
    if (input.doctrineBias?.boostSource === p.source) weight *= (1 + (input.doctrineBias.weightIncrease ?? 0.08));

    return { ...p, authorityWeight: +weight.toFixed(4) };
  });
}

// ── 3. Conflict detector ──────────────────────────────────────────────────
export function detectCouncilConflict(positions: StrategicPosition[]): { modeCount: number; conflictLevel: 'low' | 'medium' | 'high'; uniqueModes: string[] } {
  const uniqueModes = [...new Set(positions.map(p => p.mode).filter(Boolean))];
  return {
    modeCount:    uniqueModes.length,
    conflictLevel:uniqueModes.length >= 4 ? 'high' : uniqueModes.length >= 2 ? 'medium' : 'low',
    uniqueModes,
  };
}

// ── 4. Synthesis scorer ───────────────────────────────────────────────────
export function scoreCouncilDecision(input: {
  positions: Array<StrategicPosition & { authorityWeight: number }>;
}): { recommendedMode: string | null; rankings: Array<{ mode: string; score: number }> } {
  const scores: Record<string, number> = {};

  for (const p of input.positions) {
    if (p.constraints?.blocked) continue;    // blocked positions excluded from scoring
    const baseScore    = p.confidence * 0.40 + p.evidenceScore * 0.30 + (1 - p.riskScore) * 0.30;
    const weighted     = baseScore * p.authorityWeight;
    scores[p.mode]     = (scores[p.mode] ?? 0) + weighted;
  }

  const rankings = Object.entries(scores)
    .map(([mode, score]) => ({ mode, score: +score.toFixed(4) }))
    .sort((a, b) => b.score - a.score);

  return { recommendedMode: rankings[0]?.mode ?? null, rankings };
}

// ── 5. Governance constraints ─────────────────────────────────────────────
export function applyGovernanceConstraints(input: {
  recommendation: { recommendedMode: string | null };
  positions:       Array<StrategicPosition & { authorityWeight: number }>;
}): { overridden: boolean; requiresApproval: boolean; reason?: string; fallbackMode?: string } {
  // Check if winning mode is explicitly blocked
  const blocked = input.positions.find(p => p.mode === input.recommendation.recommendedMode && p.constraints?.blocked);
  if (blocked) return { overridden: true, requiresApproval: false, reason: 'blocked_by_governance', fallbackMode: 'balanced' };

  // Check if winning mode requires approval
  const needsApproval = input.positions.some(p => p.mode === input.recommendation.recommendedMode && p.constraints?.requiresApproval);
  if (needsApproval) return { overridden: false, requiresApproval: true, reason: 'approval_required' };

  return { overridden: false, requiresApproval: false };
}

// ── 6. Justification builder ──────────────────────────────────────────────
export function buildCouncilJustification(input: {
  finalMode:   string | null;
  rankings:    Array<{ mode: string; score: number }>;
  positions:   Array<StrategicPosition & { authorityWeight: number }>;
  conflictLevel: 'low' | 'medium' | 'high';
  governance:  { overridden: boolean; requiresApproval: boolean; reason?: string };
}): GovernedDecisionEnvelope['justification'] {
  const winners = input.positions.filter(p => p.mode === input.finalMode);
  const topScore = input.rankings[0]?.score ?? 0;
  const margin   = input.rankings[1] ? +(topScore - input.rankings[1].score).toFixed(4) : topScore;

  const topInfluencers = winners.map(w => ({
    source:          w.source,
    authorityWeight: w.authorityWeight,
    confidence:      w.confidence,
    evidenceScore:   w.evidenceScore,
  })).sort((a, b) => b.authorityWeight - a.authorityWeight);

  const authorityPath = topInfluencers.map(i => i.source).join(' + ');

  const conflictNote = input.conflictLevel === 'high' ? ' (resolved from 4+ competing modes)' : input.conflictLevel === 'medium' ? ' (resolved disagreement)' : '';
  const governanceNote = input.governance.overridden ? ` ⚠ governance override applied (${input.governance.reason}).` : input.governance.requiresApproval ? ' — requires operator approval before execution.' : '';
  const explanationText = `${input.finalMode?.replace(/_/g, '-')} selected via ${authorityPath}${conflictNote} with score margin +${(margin * 100).toFixed(1)}%.${governanceNote}`;

  return {
    summary:          `Final mode: ${input.finalMode}`,
    topInfluencers,
    competingModes:   input.rankings.slice(1, 3),
    authorityPath,
    explanationText,
  };
}

// ── 7. Full council orchestrator ──────────────────────────────────────────
export function runDoctrineSynthesisCouncil(input: {
  sources:       Partial<Record<StrategicPosition['source'], Omit<StrategicPosition, 'source'>>>;
  trustWeights?: Partial<Record<string, number>>;
  doctrineBias?: { preferredMode?: string | null; boostSource?: string; weightIncrease?: number };
}): GovernedDecisionEnvelope {
  const positions  = buildCouncilInputs(input.sources);
  if (positions.length === 0) {
    return { finalMode: null, requiresApproval: false, conflictLevel: 'low', rankings: [], justification: { summary: 'No positions received', topInfluencers: [], competingModes: [], authorityPath: '', explanationText: 'No intelligence sources provided to the council.' }, governance: { overridden: false }, positionCount: 0, timestamp: new Date().toISOString() };
  }

  const weighted   = applyAuthorityWeights({ positions, trustWeights: input.trustWeights, doctrineBias: input.doctrineBias });
  const conflict   = detectCouncilConflict(weighted);
  const scored     = scoreCouncilDecision({ positions: weighted });
  const governance = applyGovernanceConstraints({ recommendation: scored, positions: weighted });

  const finalMode  = governance.overridden ? (governance.fallbackMode ?? 'balanced') : scored.recommendedMode;

  const justification = buildCouncilJustification({ finalMode, rankings: scored.rankings, positions: weighted, conflictLevel: conflict.conflictLevel, governance });

  return {
    finalMode,
    requiresApproval: governance.requiresApproval,
    conflictLevel:    conflict.conflictLevel,
    rankings:         scored.rankings,
    justification,
    governance,
    positionCount:    positions.length,
    timestamp:        new Date().toISOString(),
  };
}

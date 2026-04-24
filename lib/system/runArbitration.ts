/**
 * lib/system/runArbitration.ts
 *
 * Pure function — the constitutional arbitration engine.
 *
 * Priority order:
 *   1. Operator forced actions (always win)
 *   2. Operator blocked actions (remove from candidates)
 *   3. Highest authority score wins among planner / policy / champion
 *   4. Score margin < 10 → shadow test triggered (uncertain arbitration)
 *
 * Returns the final action choice, source, authority scores, score margin,
 * and whether a shadow test should be widened.
 */
import { computeAuthorityScores, type AuthorityScores } from './computeAuthorityScores';
import { detectDecisionConflict, type ConflictType }    from './detectDecisionConflict';

export interface ArbitrationInput {
  planner: {
    actionType:    string | null;
    adjustedScore: number;
    confidence:    string;
  };
  policy?: {
    actionType:  string | null;
    ruleKey:     string | null;
    ruleWeight:  number;
    rolloutMode: string;
  } | null;
  champion?: {
    actionType:     string | null;
    successRate:    number;
    lockConfidence: number;
  } | null;
  operator?: {
    blockedActions?: string[];
    forcedActions?:  string[];
  } | null;
  calibrationError: number;
}

export interface ArbitrationResult {
  actionType:          string | null;
  source:              'planner' | 'policy' | 'champion' | 'operator' | 'none';
  reasoning:           string;
  conflictType:        ConflictType;
  authorityScores:     AuthorityScores;
  scoreMargin:         number;
  shadowTestTriggered: boolean;
  wasConflict:         boolean;
}

const SHADOW_MARGIN_THRESHOLD = 10;

export function runArbitration(input: ArbitrationInput): ArbitrationResult {
  const conflictType = detectDecisionConflict({
    planner:  { actionType: input.planner.actionType },
    policy:   input.policy  ? { actionType: input.policy.actionType  } : null,
    champion: input.champion ? { actionType: input.champion.actionType } : null,
    operator: input.operator ?? null,
  });

  const scores = computeAuthorityScores({
    planner:          { adjustedScore: input.planner.adjustedScore, confidence: input.planner.confidence },
    policy:           input.policy   ? { ruleWeight: input.policy.ruleWeight, rolloutMode: input.policy.rolloutMode } : null,
    champion:         input.champion ? { successRate: input.champion.successRate, lockConfidence: input.champion.lockConfidence } : null,
    calibrationError: input.calibrationError,
  });

  // ── Operator forced action always wins ─────────────────────────────────────
  if (input.operator?.forcedActions?.length) {
    return {
      actionType:          input.operator.forcedActions[0],
      source:              'operator',
      reasoning:           'Operator forced action — highest constitutional authority',
      conflictType,
      authorityScores:     scores,
      scoreMargin:         0,
      shadowTestTriggered: false,
      wasConflict:         conflictType !== 'no_conflict',
    };
  }

  // ── Build ranked candidates (excluding operator-blocked) ──────────────────
  const blockedSet = new Set(input.operator?.blockedActions ?? []);

  const candidates = [
    { source: 'planner'  as const, score: scores.planner,  action: input.planner.actionType  },
    { source: 'policy'   as const, score: scores.policy,   action: input.policy?.actionType  ?? null },
    { source: 'champion' as const, score: scores.champion, action: input.champion?.actionType ?? null },
  ]
    .filter(c => c.action && !blockedSet.has(c.action))
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) {
    return {
      actionType:          null,
      source:              'none',
      reasoning:           'All candidates blocked or unavailable',
      conflictType,
      authorityScores:     scores,
      scoreMargin:         0,
      shadowTestTriggered: false,
      wasConflict:         conflictType !== 'no_conflict',
    };
  }

  const winner = candidates[0];
  const runnerUp = candidates[1] ?? null;
  const scoreMargin = runnerUp ? parseFloat((winner.score - runnerUp.score).toFixed(2)) : 100;
  const shadowTestTriggered = scoreMargin < SHADOW_MARGIN_THRESHOLD && conflictType !== 'no_conflict';

  const reasonParts = [
    `${winner.source} selected with authority score ${winner.score.toFixed(1)}`,
    runnerUp ? `runner-up: ${runnerUp.source} (${runnerUp.score.toFixed(1)}, margin ${scoreMargin})` : '',
    shadowTestTriggered ? '⚠ Margin too close — challenger shadow test widened' : '',
  ].filter(Boolean).join(' · ');

  return {
    actionType:          winner.action,
    source:              winner.source,
    reasoning:           reasonParts,
    conflictType,
    authorityScores:     scores,
    scoreMargin,
    shadowTestTriggered,
    wasConflict:         conflictType !== 'no_conflict',
  };
}

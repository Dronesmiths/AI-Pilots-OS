/**
 * lib/system/selectExplorationChallengers.ts
 *
 * Pure function — ranks non-champion candidates for challenger selection.
 *
 * Scoring:
 *   base     = adjustedScore from planner
 *   +20      shadowWinRate  (reward proven shadow performance)
 *   -30      historicalHarmRate (strong penalty for harmful track record)
 *   +8       timesTried < 3 (novelty bonus: under-tested actions worth trying)
 *
 * Stops repeating weak challengers that happen to be second by score alone.
 * Only returns actions with a positive challengerPriority score.
 */

export interface ChallengerCandidate {
  actionType:           string;
  adjustedScore:        number;
  source:               string;
  historicalHarmRate?:  number;
  shadowWinRate?:       number;
  timesTried?:          number;
  challengerPriority:   number;
}

export function selectExplorationChallengers(input: {
  candidates: Array<{
    actionType:           string;
    adjustedScore:        number;
    source:               string;
    historicalHarmRate?:  number;
    shadowWinRate?:       number;
    timesTried?:          number;
  }>;
  championAction: string;
  limit:          number;
}): ChallengerCandidate[] {
  return input.candidates
    .filter(c => c.actionType !== input.championAction)
    .map(c => {
      let priority = c.adjustedScore;
      priority += (c.shadowWinRate      ?? 0) * 20;
      priority -= (c.historicalHarmRate ?? 0) * 30;
      if ((c.timesTried ?? 0) < 3) priority += 8;
      return { ...c, challengerPriority: Math.round(priority) };
    })
    .filter(c => c.challengerPriority > 0)  // exclude net-negative challengers
    .sort((a, b) => b.challengerPriority - a.challengerPriority)
    .slice(0, input.limit);
}

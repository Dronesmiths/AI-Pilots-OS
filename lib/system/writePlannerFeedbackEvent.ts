/**
 * lib/system/writePlannerFeedbackEvent.ts
 *
 * Creates a PlannerFeedbackEvent after outcome evaluation.
 * Append-only — called once per decision once the observation window closes.
 */
import connectToDatabase    from '@/lib/mongodb';
import PlannerFeedbackEvent from '@/models/PlannerFeedbackEvent';
import type { OutcomeLabel, RecommendationQuality } from './evaluatePlannerOutcome';

export async function writePlannerFeedbackEvent(input: {
  plannerDecisionId:          string;
  tenantId:                   string;
  anomalyType:                string;
  recommendedAction:          string;
  selectedAction:             string;
  winningSource:              'graph' | 'causal_memory' | 'leaderboard' | 'policy_bias' | 'hybrid';
  lifecycleStage:             string;
  trustTier:                  string;
  policyMode:                 string;
  executionMode:              'suggest' | 'shadow' | 'auto' | 'approved_manual';
  outcomeLabel:               OutcomeLabel;
  outcomeScoreDelta:          number;
  confidenceCalibrationDelta: number;
  recommendationQuality:      RecommendationQuality;
  matchedTopCandidate:        boolean;
  matchedRecommendedAction:   boolean;
  beforeHealthScore:          number;
  afterHealthScore:           number;
  counterfactualWinner?:      string | null;
  counterfactualBeatPlanner?: boolean;
  notes?:                     string;
}): Promise<void> {
  await connectToDatabase();
  await PlannerFeedbackEvent.create(input);
}

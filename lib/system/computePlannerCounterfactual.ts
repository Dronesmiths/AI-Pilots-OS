/**
 * lib/system/computePlannerCounterfactual.ts
 *
 * Estimates whether a runner-up candidate would have outperformed the chosen action.
 * Currently a stub — returns no counterfactual winner.
 *
 * Future: query graph path strengths and causal memory for runner-up candidates,
 * estimate their expected value vs the actual outcome, and return whether
 * the runner-up would likely have produced a better result.
 *
 * Deliberately kept simple per launch cut line guidance.
 * Will be expanded when enough feedback events exist to estimate counterfactual EV.
 */

export interface CounterfactualResult {
  counterfactualWinner:     string | null;
  counterfactualBeatPlanner:boolean;
}

export async function computePlannerCounterfactual(_input: {
  decisionId: string;
}): Promise<CounterfactualResult> {
  // Stub: no counterfactual estimation yet
  return {
    counterfactualWinner:      null,
    counterfactualBeatPlanner: false,
  };
}

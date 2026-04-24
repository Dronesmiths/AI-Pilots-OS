/**
 * lib/system/runReplaySimulation.ts
 *
 * Runs one variant through simulateGovernedDecision (non-persisting)
 * and estimateReplayOutcome (evidence-based).
 *
 * NEVER calls routeExecution or executeGovernedAction.
 * The replay boundary is enforced here — no live tenant effects.
 */
import { simulateGovernedDecision } from './simulateGovernedDecision';
import { estimateReplayOutcome }    from './estimateReplayOutcome';
import type { ReplayState }         from './reconstructReplayState';

export interface ReplaySimulationResult {
  simulatedEnvelope: any;
  estimatedOutcome:  {
    outcomeLabel:   string;
    estimatedDelta: number;
    confidence:     number;
    basis:          string;
  };
}

export async function runReplaySimulation(input: {
  replayState: ReplayState;
  variantType: string;
}): Promise<ReplaySimulationResult> {
  // 1. Run the governance pipeline (no persistence, no execution)
  const simulatedEnvelope = await simulateGovernedDecision(input.replayState, input.variantType);

  // 2. Estimate outcome using market evidence (no Math.random)
  const estimatedOutcome = await estimateReplayOutcome({
    originalState:     input.replayState,
    simulatedEnvelope,
  });

  return { simulatedEnvelope, estimatedOutcome };
}

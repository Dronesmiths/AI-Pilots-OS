/**
 * lib/system/reconstructReplayState.ts
 *
 * Loads a past GovernedDecisionRecord and reconstructs the exact state
 * that existed at decision time. This is the starting point for all replay.
 *
 * Returns the full decision state including all intelligence layer inputs,
 * so mutations can be applied precisely to one layer at a time.
 */
import connectToDatabase       from '@/lib/mongodb';
import GovernedDecisionRecord  from '@/models/GovernedDecisionRecord';

export interface ReplayState {
  _id:              any;
  traceId:          string;
  tenantId:         string;
  scopeKey:         string;
  anomalyType:      string;
  anomalySeverity:  string;
  contextSnapshot:  Record<string, any>;
  plannerCandidates:   any[];
  policyInfluences:    any[];
  inheritedInfluences: any[];
  marketEvidence:      any[];
  arbitration:         any;
  operatorGovernance:  any;
  finalDecision:       any;
  authorityPath:       string[];
  outcome:             any;
}

export async function reconstructReplayState(traceId: string): Promise<ReplayState> {
  await connectToDatabase();
  const decision = await GovernedDecisionRecord.findOne({ traceId }).lean() as any;
  if (!decision) throw new Error(`GovernedDecisionRecord not found for traceId=${traceId}`);

  return {
    _id:                  decision._id,
    traceId:              decision.traceId,
    tenantId:             decision.tenantId,
    scopeKey:             decision.scopeKey,
    anomalyType:          decision.anomalyType,
    anomalySeverity:      decision.anomalySeverity ?? 'medium',
    contextSnapshot:      decision.contextSnapshot      ?? {},
    plannerCandidates:    decision.plannerCandidates    ?? [],
    policyInfluences:     decision.policyInfluences     ?? [],
    inheritedInfluences:  decision.inheritedInfluences  ?? [],
    marketEvidence:       decision.marketEvidence        ?? [],
    arbitration:          decision.arbitration           ?? null,
    operatorGovernance:   decision.operatorGovernance    ?? null,
    finalDecision:        decision.finalDecision         ?? null,
    authorityPath:        decision.authorityPath         ?? [],
    outcome:              decision.outcome               ?? null,
  };
}

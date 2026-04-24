/**
 * lib/system/runPlannerFeedbackLoop.ts
 *
 * Feedback resolver — processes pending planner decisions whose observation
 * window has elapsed. Called via POST /api/admin/intervention-planner/feedback/run.
 *
 * For each resolved decision:
 *   1. Compute before/after health delta from real data
 *   2. Check anomaly resolution status
 *   3. Evaluate outcome quality
 *   4. Write PlannerFeedbackEvent
 *   5. Update PlannerSignalCalibration
 *   6. Mark decision resolved
 *
 * Real health data strategy:
 *   before = contextSnapshot.healthScore (stored at decision time)
 *   after  = current TenantFleetHealth.healthScore (live lookup)
 *   anomalyResolved = no open TenantLifecycleAnomaly for this (tenantId, anomalyType)
 *
 * Processes up to FEEDBACK_BATCH_SIZE decisions per run (ENV-configurable).
 */
import connectToDatabase                            from '@/lib/mongodb';
import PlannerDecisionRecord                        from '@/models/PlannerDecisionRecord';
import TenantFleetHealth                            from '@/models/TenantFleetHealth';
import TenantLifecycleAnomaly                       from '@/models/TenantLifecycleAnomaly';
import { evaluatePlannerOutcome }                   from './evaluatePlannerOutcome';
import { writePlannerFeedbackEvent }                from './writePlannerFeedbackEvent';
import { updatePlannerSignalCalibration }           from './updatePlannerSignalCalibration';
import { updatePlannerConfidenceCalibration }       from './updatePlannerConfidenceCalibration';
import { updateScopeActionMarket }                  from './updateScopeActionMarket';
import { computePlannerCounterfactual }             from './computePlannerCounterfactual';

const BATCH_SIZE = parseInt(process.env.FEEDBACK_BATCH_SIZE ?? '50', 10);

export interface FeedbackLoopResult {
  processed: number;
  resolved:   number;
  skipped:    number;
  errors:     number;
}

export async function runPlannerFeedbackLoop(): Promise<FeedbackLoopResult> {
  await connectToDatabase();

  const result: FeedbackLoopResult = { processed: 0, resolved: 0, skipped: 0, errors: 0 };

  const pending = await PlannerDecisionRecord.find({
    feedbackStatus: { $in: ['pending', 'observing'] },
    executed:       true,
  })
    .sort({ createdAt: 1 }) // oldest first
    .limit(BATCH_SIZE)
    .lean() as any[];

  for (const decision of pending) {
    result.processed++;

    try {
      // ── Check if observation window has elapsed ─────────────────────────
      const ageMs       = Date.now() - new Date(decision.createdAt).getTime();
      const windowMs    = (decision.observationWindowMinutes ?? 60) * 60 * 1000;
      const windowReady = ageMs >= windowMs;

      if (!windowReady) {
        // Mark as 'observing' if still pending
        if (decision.feedbackStatus === 'pending') {
          await PlannerDecisionRecord.updateOne({ _id: decision._id }, { $set: { feedbackStatus: 'observing' } });
        }
        result.skipped++;
        continue;
      }

      // ── Real health data lookup ──────────────────────────────────────────
      const beforeHealthScore = decision.contextSnapshot?.healthScore ?? 50;

      const [fleetHealth, openAnomaly] = await Promise.all([
        TenantFleetHealth.findOne({ tenantId: decision.tenantId }).select('healthScore').lean() as Promise<any>,
        TenantLifecycleAnomaly.findOne({
          tenantId:    decision.tenantId,
          anomalyType: decision.anomalyType,
          status:      'open',
        }).select('_id').lean(),
      ]);

      const afterHealthScore   = fleetHealth?.healthScore ?? beforeHealthScore;
      const anomalyResolved    = !openAnomaly;
      const executionSucceeded = decision.executed ?? false;

      // ── Evaluate outcome ─────────────────────────────────────────────────
      const evaluated = evaluatePlannerOutcome({
        beforeHealthScore,
        afterHealthScore,
        anomalyResolved,
        executionSucceeded,
        confidence: decision.recommendedConfidence,
      });

      // ── Counterfactual (stub) ────────────────────────────────────────────
      const counterfactual = await computePlannerCounterfactual({ decisionId: String(decision._id) });

      // ── Write feedback event ─────────────────────────────────────────────
      await writePlannerFeedbackEvent({
        plannerDecisionId:          String(decision._id),
        tenantId:                   decision.tenantId,
        anomalyType:                decision.anomalyType,
        recommendedAction:          decision.recommendedAction,
        selectedAction:             decision.selectedAction ?? decision.recommendedAction,
        winningSource:              decision.winningSource,
        lifecycleStage:             decision.lifecycleStage,
        trustTier:                  decision.trustTier,
        policyMode:                 decision.policyMode,
        executionMode:              decision.executionMode,
        outcomeLabel:               evaluated.outcomeLabel,
        outcomeScoreDelta:          evaluated.outcomeScoreDelta,
        confidenceCalibrationDelta: evaluated.confidenceCalibrationDelta,
        recommendationQuality:      evaluated.recommendationQuality,
        matchedTopCandidate:        true,
        matchedRecommendedAction:   (decision.selectedAction ?? decision.recommendedAction) === decision.recommendedAction,
        beforeHealthScore,
        afterHealthScore,
        counterfactualWinner:       counterfactual.counterfactualWinner,
        counterfactualBeatPlanner:  counterfactual.counterfactualBeatPlanner,
      });

      // ── Update signal calibration ───────────────────────────────────────────────
      await updatePlannerSignalCalibration({
        anomalyType:                decision.anomalyType,
        lifecycleStage:             decision.lifecycleStage,
        trustTier:                  decision.trustTier,
        policyMode:                 decision.policyMode,
        winningSource:              decision.winningSource,
        outcomeScoreDelta:          evaluated.outcomeScoreDelta,
        recommendationQuality:      evaluated.recommendationQuality,
        counterfactualBeatPlanner:  counterfactual.counterfactualBeatPlanner,
        confidenceCalibrationDelta: evaluated.confidenceCalibrationDelta,
      });

      // ── Update confidence calibration (self-doubt learning) ──────────────────
      await updatePlannerConfidenceCalibration({
        anomalyType:    decision.anomalyType,
        lifecycleStage: decision.lifecycleStage,
        trustTier:      decision.trustTier,
        policyMode:     decision.policyMode,
        confidence:     decision.recommendedConfidence,
        outcomeLabel:   evaluated.outcomeLabel,
      });

      // ── Update scope action market (champion/challenger standings) ────────────
      const marketScopeKey = [decision.anomalyType, decision.lifecycleStage, decision.trustTier, decision.policyMode].join('::');
      await updateScopeActionMarket({
        scopeKey:          marketScopeKey,
        anomalyType:       decision.anomalyType,
        lifecycleStage:    decision.lifecycleStage,
        trustTier:         decision.trustTier,
        policyMode:        decision.policyMode,
        actionType:        decision.selectedAction ?? decision.recommendedAction,
        outcomeQuality:    evaluated.recommendationQuality,
        outcomeDelta:      evaluated.outcomeScoreDelta,
        wasShadow:         decision.executionMode === 'shadow',
        wonCounterfactual: counterfactual.counterfactualBeatPlanner === false,
      });

      // ── Mark resolved ────────────────────────────────────────────────────────
      await PlannerDecisionRecord.updateOne(
        { _id: decision._id },
        { $set: { feedbackStatus: 'resolved' } }
      );

      result.resolved++;
    } catch (err: any) {
      console.error(`[runPlannerFeedbackLoop] error on decision ${decision._id}:`, err?.message);
      result.errors++;
    }
  }

  return result;
}

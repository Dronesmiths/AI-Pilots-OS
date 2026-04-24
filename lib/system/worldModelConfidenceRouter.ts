/**
 * lib/system/worldModelConfidenceRouter.ts
 *
 * World Model Confidence Routing — 5 exports.
 *
 * A "world model" is Nova's current best estimate of reality:
 *   - what it knows about the tenant's state
 *   - how reliable each intelligence source is
 *   - how calibrated its predictions have been
 *   - how consistent its strategic sources are with each other
 *
 * Confidence routing asks:
 *   "Given what I know about how well I understand the world right now,
 *    which source should I trust, and how conservative should I be?"
 *
 * This layer does NOT replace arbitration or the doctrine council.
 * It produces a WorldModelConfidence envelope that upstream engines
 * can use to:
 *   • adjust which KnowledgeRoutingPolicy conflictMode to apply
 *   • raise or lower minConfidenceForGlobal thresholds dynamically
 *   • bias the DoctrineSynthesisCouncil trustWeights before blending
 *   • trigger shadow-first mode when world model confidence is low
 *
 * ── Existing models used (no new models created) ──────────────────────────
 *   StrategicTrustProfile         → per-source trust weights (liveSignals,
 *                                   strategicMemory, simulation, crossTenant)
 *                                   Updated by runRegretDrivenTrustTraining.
 *
 *   PlannerConfidenceCalibration  → overconfidenceScore, underconfidenceScore,
 *                                   calibrationError per scope. Used by
 *                                   computeAuthorityScores to penalize scores.
 *
 *   SeoCalibrationState           → simulation realism confidence per action
 *                                   (confidenceMultiplier 0.50–1.20).
 *
 *   AdaptiveWeightProfile         → confidenceDoubtMultiplier, plannerWeight,
 *                                   policyWeight. The "accumulated self-doubt"
 *                                   of the decision engine per scope.
 *
 *   KnowledgeRoutingPolicy        → routing rules including minConfidenceForGlobal
 *                                   and conflictMode. Read to understand current
 *                                   routing posture; confidence routing adjusts
 *                                   the inputs that select which rule to apply.
 *
 * ── Exports ───────────────────────────────────────────────────────────────
 *   buildWorldModelConfidence     pure. Aggregates 4 signal streams into a
 *                                 single WorldModelConfidence score (0..1) with
 *                                 per-dimension breakdown.
 *
 *   classifyConfidencePosture     pure. Maps score → routing posture:
 *                                 assured / cautious / skeptical / grounded
 *
 *   deriveRoutingAdjustments      pure. Translates posture → concrete routing
 *                                 parameter adjustments (conflictMode override,
 *                                 minConfidenceForGlobal lift, shadow bias, etc.)
 *
 *   applyConfidenceToTrustWeights pure. Takes a WorldModelConfidence envelope
 *                                 and biases a StrategicPosition trust weight
 *                                 map before it enters the DoctrineSynthesisCouncil.
 *
 *   buildWorldModelConfidenceEnvelope  async orchestrator. Loads the required
 *                                 state from DB, calls the pure functions, returns
 *                                 the full envelope ready for injection into
 *                                 routing and council decisions.
 *
 * ── Design rules ──────────────────────────────────────────────────────────
 *   1. Operator override always wins — confidence routing never blocks operator.
 *   2. Low confidence → more local truth bias, not paralysis.
 *   3. Confidence cannot exceed 1.0 or drop below 0.0.
 *   4. No single signal can alone collapse confidence to zero.
 *   5. This function is always non-blocking (errors → neutral confidence = 0.5).
 */

import connectToDatabase              from '@/lib/mongodb';
import { StrategicTrustProfile }      from '@/models/system/StrategicInstinct';
import PlannerConfidenceCalibration   from '@/models/PlannerConfidenceCalibration';
import SeoCalibrationState            from '@/models/SeoCalibrationState';
import AdaptiveWeightProfile          from '@/models/system/AdaptiveWeightProfile';

const clamp = (n: number) => Math.max(0, Math.min(1, +n.toFixed(4)));

// ── Types ─────────────────────────────────────────────────────────────────

export type ConfidencePosture = 'assured' | 'cautious' | 'skeptical' | 'grounded';

export interface WorldModelConfidenceDimensions {
  /** How well-calibrated is planner confidence vs actual outcomes (0..1, higher=better) */
  plannerCalibration:   number;
  /** How consistent and reliable are strategic trust weights (liveSignals, memory, sim) */
  sourceTrustCoherence: number;
  /** How accurate is the simulation sandbox (from SeoCalibrationState multiplier) */
  simulationRealism:    number;
  /** How much accumulated self-doubt exists in the adaptive weight profile */
  selfDoubtLevel:       number;   // 0..1, 0 = no doubt, 1 = maximum doubt
}

export interface RoutingAdjustments {
  /** Override conflictMode for routing decisions below this confidence */
  conflictModeOverride:     string | null;
  /** Raise minConfidenceForGlobal by this delta (0 = no change) */
  minConfidenceForGlobalLift: number;
  /** If true, prefer shadow-first for all non-forced routing decisions */
  preferShadowFirst:        boolean;
  /** Bias toward local truth (tenant scope) vs global federation */
  localTruthBias:           number; // 0..1, 1 = fully local, 0 = balanced
}

export interface WorldModelConfidence {
  score:        number;             // 0..1 composite
  posture:      ConfidencePosture;
  dimensions:   WorldModelConfidenceDimensions;
  adjustments:  RoutingAdjustments;
  timestamp:    string;
}

// ── 1. Build composite world model confidence (pure) ──────────────────────
/**
 * Aggregates 4 confidence signal streams into a single score.
 *
 * Score formula (all 0..1, higher = more confident):
 *   plannerCalibration   × 0.30  (is planner trustworthy?)
 *   sourceTrustCoherence × 0.30  (are strategic sources agreeing?)
 *   simulationRealism    × 0.25  (can we trust the sandbox?)
 *   (1 - selfDoubtLevel) × 0.15  (has the weight engine lost faith in itself?)
 *
 * Each dimension is independently meaningful for routing decisions.
 */
export function buildWorldModelConfidence(dims: WorldModelConfidenceDimensions): number {
  return clamp(
    dims.plannerCalibration   * 0.30 +
    dims.sourceTrustCoherence * 0.30 +
    dims.simulationRealism    * 0.25 +
    (1 - dims.selfDoubtLevel) * 0.15
  );
}

// ── 2. Classify confidence into posture (pure) ────────────────────────────
/**
 * Four postures, each triggering different routing behavior:
 *
 *   assured   (≥ 0.75):  High confidence. Trust global sources, apply simulation
 *                         results, allow approve-grade verdicts.
 *
 *   cautious  (≥ 0.55):  Moderate confidence. Prefer confidence_weighted conflict
 *                         mode. Raise minConfidenceForGlobal slightly. No changes
 *                         to shadow gating.
 *
 *   skeptical (≥ 0.35):  Low confidence. Prefer local_truth_wins conflict mode.
 *                         Block global-only routing for high-stakes decisions.
 *                         Simulation verdicts capped at shadow.
 *
 *   grounded  (< 0.35):  Very low confidence. Force higher_scope_wins override with
 *                         constitutional_first for high-risk paths. Strong local
 *                         truth bias. Maximum shadow conservatism.
 */
export function classifyConfidencePosture(score: number): ConfidencePosture {
  if (score >= 0.75) return 'assured';
  if (score >= 0.55) return 'cautious';
  if (score >= 0.35) return 'skeptical';
  return 'grounded';
}

// ── 3. Derive concrete routing adjustments from posture (pure) ────────────
/**
 * Translates posture into actionable routing parameter adjustments.
 * These adjustments are INPUTS to routing decisions — they do not
 * override the KnowledgeRoutingPolicy schema directly, but are passed
 * to routing calls so engines can select appropriate rules.
 */
export function deriveRoutingAdjustments(posture: ConfidencePosture): RoutingAdjustments {
  switch (posture) {
    case 'assured':
      return {
        conflictModeOverride:       null,          // use policy default
        minConfidenceForGlobalLift: 0,             // no adjustment
        preferShadowFirst:          false,
        localTruthBias:             0.1,           // slight local preference, not dominant
      };

    case 'cautious':
      return {
        conflictModeOverride:       'confidence_weighted',
        minConfidenceForGlobalLift: 0.05,          // slightly harder to route globally
        preferShadowFirst:          false,
        localTruthBias:             0.25,
      };

    case 'skeptical':
      return {
        conflictModeOverride:       'local_truth_wins',
        minConfidenceForGlobalLift: 0.15,          // meaningfully harder to route globally
        preferShadowFirst:          true,
        localTruthBias:             0.55,
      };

    case 'grounded':
      return {
        conflictModeOverride:       'constitutional_first',
        minConfidenceForGlobalLift: 0.25,          // near-lock on global routing
        preferShadowFirst:          true,
        localTruthBias:             0.75,          // strong local truth anchor
      };
  }
}

// ── 4. Apply confidence to trust weight map (pure) ────────────────────────
/**
 * Adjusts the trust weight map that feeds into DoctrineSynthesisCouncil
 * (applyAuthorityWeights) based on world model confidence.
 *
 * Mechanics:
 *   - In low-confidence states, simulation and crossTenant sources are
 *     dampened (they're the least grounded in local reality).
 *   - liveSignals is always preserved or slightly boosted (ground truth).
 *   - strategicMemory is preserved (it reflects past outcomes, not predictions).
 *   - Changes are bounded: no source can be pushed below 0.05 or above 0.70
 *     (matching the runRegretDrivenTrustTraining clamp bounds).
 *
 * This does NOT replace regret-driven trust updates — it applies a
 * temporary posture bias on top of the current trust weights.
 */
export function applyConfidenceToTrustWeights(
  weights:  Partial<Record<string, number>>,
  posture:  ConfidencePosture,
): Record<string, number> {
  const clampWeight = (n: number) => Math.max(0.05, Math.min(0.70, +n.toFixed(4)));
  const result: Record<string, number> = { ...weights } as Record<string, number>;

  const dampFactors: Record<ConfidencePosture, { simulation: number; crossTenant: number; liveSignalsBias: number }> = {
    assured:   { simulation: 1.00, crossTenant: 1.00, liveSignalsBias: 0.00 },
    cautious:  { simulation: 0.85, crossTenant: 0.90, liveSignalsBias: 0.03 },
    skeptical: { simulation: 0.65, crossTenant: 0.70, liveSignalsBias: 0.06 },
    grounded:  { simulation: 0.45, crossTenant: 0.50, liveSignalsBias: 0.10 },
  };

  const f = dampFactors[posture];

  if (result.simulation  !== undefined) result.simulation  = clampWeight(result.simulation  * f.simulation);
  if (result.crossTenant !== undefined) result.crossTenant = clampWeight(result.crossTenant * f.crossTenant);
  if (result.liveSignals !== undefined) result.liveSignals = clampWeight(result.liveSignals + f.liveSignalsBias);

  return result;
}

// ── 5. Async orchestrator — builds full envelope from live DB state ────────
/**
 * Loads the 4 signal streams from DB and returns the complete
 * WorldModelConfidence envelope.
 *
 * Inputs pulled from DB:
 *   StrategicTrustProfile   → source trust weights (liveSignals, sim, crossTenant, memory)
 *   PlannerConfidenceCalibration → calibrationError for the given scope
 *   SeoCalibrationState     → simulation confidenceMultiplier (fleet-global)
 *   AdaptiveWeightProfile   → confidenceDoubtMultiplier per profile key
 *
 * Scope args:
 *   tenantId     used to find StrategicTrustProfile
 *   scopeKey     used to find AdaptiveWeightProfile + PlannerConfidenceCalibration
 *                format: {anomalyType}::{lifecycleStage}::{trustTier}::{policyMode}
 *                Pass '*::*::*::*' for the global default profile.
 *
 * Always returns a valid envelope — no exceptions propagate (returns
 * NEUTRAL_CONFIDENCE on any DB error so routing is never blocked).
 */
export async function buildWorldModelConfidenceEnvelope(args: {
  tenantId?:  string;
  scopeKey?:  string;
}): Promise<WorldModelConfidence> {
  const NEUTRAL_DIMS: WorldModelConfidenceDimensions = {
    plannerCalibration:   0.6,
    sourceTrustCoherence: 0.6,
    simulationRealism:    0.6,
    selfDoubtLevel:       0.2,
  };

  try {
    await connectToDatabase();

    const scopeKey = args.scopeKey ?? '*::*::*::*';
    const tenantId = args.tenantId;

    // ── A. Planner calibration error → plannerCalibration dimension ────────
    let plannerCalibration = 0.6;  // neutral default
    const [scopeParts] = [scopeKey.split('::')];
    if (scopeParts.length === 4) {
      const [anomalyType, lifecycleStage, trustTier, policyMode] = scopeParts;
      const calDoc = await PlannerConfidenceCalibration.findOne({
        anomalyType, lifecycleStage, trustTier, policyMode,
      }).lean() as any;
      if (calDoc) {
        const err = calDoc.calibrationError ?? 0;
        // calibrationError 0 → full confidence; 1 → zero confidence
        plannerCalibration = clamp(1 - err);
      }
    }

    // ── B. Trust weight coherence → sourceTrustCoherence dimension ─────────
    // Coherence is high when trust weights are balanced (no single source dominates).
    // Incoherence = high variance across source weights.
    let sourceTrustCoherence = 0.6;
    if (tenantId) {
      const trustProfile = await StrategicTrustProfile.findOne({ tenantId }).lean() as any;
      if (trustProfile?.trustWeights) {
        const weights = trustProfile.trustWeights as Record<string, number>;
        const vals = Object.values(weights).filter((v): v is number => typeof v === 'number');
        if (vals.length >= 2) {
          const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
          const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
          // Low variance = high coherence. Max expected variance ≈ 0.10 (weights 0.05–0.70)
          sourceTrustCoherence = clamp(1 - variance / 0.10);
        }
      }
    }

    // ── C. Simulation realism → simulationRealism dimension ────────────────
    // Read the global fleet confidenceMultiplier from SeoCalibrationState.
    // multiplier range 0.50–1.20; normalize to 0..1.
    let simulationRealism = 0.6;
    const calState = await SeoCalibrationState.findOne({ scopeType: 'global', scopeId: 'fleet' }).lean() as any;
    if (calState?.actions?.length) {
      // Average across all action arms (boost, reinforce, publish, internal_links)
      const arms = calState.actions as any[];
      const avgMultiplier = arms.reduce((s: number, a: any) => s + (a.confidenceMultiplier ?? 1.0), 0) / arms.length;
      // multiplier 0.50 → 0.0 realism, 1.20 → 1.0 realism
      simulationRealism = clamp((avgMultiplier - 0.50) / 0.70);
    }

    // ── D. Adaptive weight self-doubt → selfDoubtLevel dimension ───────────
    // confidenceDoubtMultiplier: 1.0 = no doubt (neutral), < 1.0 = uncertain
    // Invert and normalize: 1.0 multiplier → 0.0 doubt, 0.40 multiplier → 1.0 doubt
    let selfDoubtLevel = 0.2;  // slight baseline uncertainty
    const weightProfile = await AdaptiveWeightProfile.findOne({
      $or: [
        { profileKey: scopeKey },
        { 'scopeSelector.anomalyType': '*', status: 'learning' },
      ],
    }).lean() as any;
    if (weightProfile) {
      const doubt = weightProfile.confidenceDoubtMultiplier ?? 1.0;
      // doubt 1.0 → selfDoubtLevel=0, doubt 0.40 → selfDoubtLevel=1
      selfDoubtLevel = clamp((1.0 - doubt) / 0.60);
    }

    const dimensions: WorldModelConfidenceDimensions = {
      plannerCalibration,
      sourceTrustCoherence,
      simulationRealism,
      selfDoubtLevel,
    };

    const score   = buildWorldModelConfidence(dimensions);
    const posture = classifyConfidencePosture(score);
    const adjustments = deriveRoutingAdjustments(posture);

    return { score, posture, dimensions, adjustments, timestamp: new Date().toISOString() };
  } catch {
    // Never block routing on DB errors — return cautious neutral
    const dims = NEUTRAL_DIMS;
    const score = buildWorldModelConfidence(dims);
    const posture = classifyConfidencePosture(score);
    return { score, posture, dimensions: dims, adjustments: deriveRoutingAdjustments(posture), timestamp: new Date().toISOString() };
  }
}

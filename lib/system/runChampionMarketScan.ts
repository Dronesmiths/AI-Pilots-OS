/**
 * lib/system/runChampionMarketScan.ts
 *
 * Market scan — processes all active ScopeActionMarket records to:
 *
 *   1. Evaluate champion decay (shouldDemote / shouldReopen)
 *   2. Evaluate if locked/soft_locked markets should reopen
 *   3. Find the top challenger and evaluate promotion
 *   4. Create ChampionPromotionCase if thresholds crossed
 *   5. Auto-apply 'approve' verdicts for low-risk cases
 *   6. Apply demotions if shouldDemote triggered
 *
 * Safe rollout: auto_apply gated by ENV CHAMPION_AUTO_APPLY=true (default: false).
 * When disabled, all cases are created but left for operator resolution.
 *
 * Called via: POST /api/admin/champion-market/scan
 * Processes up to MARKET_SCAN_BATCH (default 30) markets per run.
 */
import connectToDatabase         from '@/lib/mongodb';
import ScopeActionMarket         from '@/models/ScopeActionMarket';
import ChampionPromotionCase     from '@/models/ChampionPromotionCase';
import { evaluateChampionDecay } from './evaluateChampionDecay';
import { evaluateScopeReopen }   from './evaluateScopeReopen';
import { evaluateChampionPromotion } from './evaluateChampionPromotion';
import { applyChampionPromotion }    from './applyChampionPromotion';
import { applyChampionDemotion }     from './applyChampionDemotion';

const BATCH_SIZE    = parseInt(process.env.MARKET_SCAN_BATCH     ?? '30',    10);
const AUTO_APPLY    = process.env.CHAMPION_AUTO_APPLY === 'true';

export interface MarketScanResult {
  marketsScanned:    number;
  casesCreated:      number;
  promotionsApplied: number;
  demotionsApplied:  number;
  reopensTriggered:  number;
  errors:            number;
}

export async function runChampionMarketScan(): Promise<MarketScanResult> {
  await connectToDatabase();

  const result: MarketScanResult = {
    marketsScanned: 0, casesCreated: 0, promotionsApplied: 0, demotionsApplied: 0, reopensTriggered: 0, errors: 0,
  };

  const markets = await ScopeActionMarket.find({}).limit(BATCH_SIZE).lean() as any[];

  for (const market of markets) {
    result.marketsScanned++;
    try {
      const champion = market.actions?.find((a: any) => a.role === 'champion' && a.actionType === market.currentChampionAction);

      // ── Champion decay and reopen evaluation ────────────────────────────
      if (champion) {
        const lastWon          = champion.lastWonAt ? new Date(champion.lastWonAt) : null;
        const daysSinceLastWin = lastWon ? (Date.now() - lastWon.getTime()) / 86_400_000 : 30;

        const decay = evaluateChampionDecay({
          historicalWinRate:      champion.winRate       ?? 0,
          recentWinRate:          champion.recentWinRate ?? 0,
          historicalHarmRate:     champion.harmRate       ?? 0,
          recentHarmRate:         champion.recentHarmRate ?? 0,
          counterfactualLossRate: 0,  // TODO: wire from PlannerSignalCalibration
          daysSinceLastWin,
          calibrationError:       0,  // TODO: wire from PlannerConfidenceCalibration
          driftScore:             0,  // TODO: wire from drift detector
        });

        // Update champion standing's decayScore in memory for promotion eval
        champion.decayScore = decay.decayScore;

        const reopen = evaluateScopeReopen({
          marketStatus:           market.marketStatus,
          championDecayScore:     decay.decayScore,
          driftScore:             0,
          counterfactualLossRate: 0,
          calibrationError:       0,
          plannerHitRate:         champion.winRate ?? 0,
          recentHarmRate:         champion.recentHarmRate ?? 0,
        });

        if (reopen.shouldReopen) {
          result.reopensTriggered++;

          // Create demotion case
          const existingCase = await ChampionPromotionCase.findOne({
            scopeKey: market.scopeKey, caseType: 'demotion', resolved: false,
          });
          if (!existingCase) {
            await ChampionPromotionCase.create({
              scopeKey:              market.scopeKey,
              anomalyType:           market.anomalyType,
              lifecycleStage:        market.lifecycleStage,
              trustTier:             market.trustTier,
              policyMode:            market.policyMode,
              caseType:              'demotion',
              currentChampionAction: market.currentChampionAction,
              targetAction:          null,
              verdict:               reopen.shouldReopen && decay.decayScore >= 45 ? 'approve' : 'approval_required',
              decisionConfidence:    Math.min(0.9, decay.decayScore / 60),
              rationale:             `Champion decay detected (score ${decay.decayScore}, dominant: ${decay.dominant}) — reason: ${reopen.reopenReason}`,
              evidence: {
                championWinRate:       champion.winRate ?? 0,
                championRecentWinRate: champion.recentWinRate ?? 0,
                championDecayScore:    decay.decayScore,
              },
            });
            result.casesCreated++;

            // Auto-apply demotion if auto_apply enabled and shouldDemote
            if (AUTO_APPLY && decay.shouldDemote) {
              await applyChampionDemotion({
                scopeKey:       market.scopeKey,
                championAction: market.currentChampionAction,
                moveTo:         'probation',
                reopenReason:   reopen.reopenReason,
              });
              result.demotionsApplied++;
            }
          }
        }
      }

      // ── Challenger promotion evaluation ──────────────────────────────────
      const challengers = (market.actions ?? [])
        .filter((a: any) => a.role === 'challenger' && a.sampleCount >= 1)
        .sort((x: any, y: any) => (y.promotionScore ?? 0) - (x.promotionScore ?? 0));

      const topChallenger = challengers[0] ?? null;

      if (topChallenger) {
        const promotionResult = evaluateChampionPromotion({
          challenger: {
            actionType:               topChallenger.actionType,
            sampleCount:              topChallenger.sampleCount ?? 0,
            winRate:                  topChallenger.winRate ?? 0,
            recentWinRate:            topChallenger.recentWinRate ?? 0,
            harmRate:                 topChallenger.harmRate ?? 0,
            avgOutcomeDelta:          topChallenger.avgOutcomeDelta ?? 0,
            shadowWinRate:            topChallenger.shadowWinRate ?? 0,
            counterfactualWinRate:    topChallenger.counterfactualWinRate ?? 0,
            confidenceCalibrationFit: topChallenger.confidenceCalibrationFit ?? 0,
            trustCompatibility:       topChallenger.trustCompatibility ?? 1,
          },
          champion: champion ? {
            actionType:               champion.actionType,
            sampleCount:              champion.sampleCount ?? 0,
            winRate:                  champion.winRate ?? 0,
            recentWinRate:            champion.recentWinRate ?? 0,
            harmRate:                 champion.harmRate ?? 0,
            avgOutcomeDelta:          champion.avgOutcomeDelta ?? 0,
            confidenceCalibrationFit: champion.confidenceCalibrationFit ?? 0,
            trustCompatibility:       champion.trustCompatibility ?? 1,
            decayScore:               champion.decayScore ?? 0,
          } : null,
          driftScore: 0,
        });

        // Only create promotion cases if verdict is not reject
        if (promotionResult.verdict !== 'reject') {
          const existingPromo = await ChampionPromotionCase.findOne({
            scopeKey:      market.scopeKey,
            caseType:      'promotion',
            targetAction:  topChallenger.actionType,
            resolved:      false,
          });

          if (!existingPromo) {
            await ChampionPromotionCase.create({
              scopeKey:              market.scopeKey,
              anomalyType:           market.anomalyType,
              lifecycleStage:        market.lifecycleStage,
              trustTier:             market.trustTier,
              policyMode:            market.policyMode,
              caseType:              'promotion',
              currentChampionAction: market.currentChampionAction,
              targetAction:          topChallenger.actionType,
              verdict:               promotionResult.verdict,
              decisionConfidence:    promotionResult.decisionConfidence,
              rationale:             promotionResult.rationale,
              evidence: {
                challengerWinRate:         topChallenger.winRate ?? 0,
                challengerRecentWinRate:   topChallenger.recentWinRate ?? 0,
                challengerAvgOutcomeDelta: topChallenger.avgOutcomeDelta ?? 0,
                challengerShadowWinRate:   topChallenger.shadowWinRate ?? 0,
                challengerCounterfactualWinRate: topChallenger.counterfactualWinRate ?? 0,
                championWinRate:       champion?.winRate ?? 0,
                championRecentWinRate: champion?.recentWinRate ?? 0,
                deltaWinRate:          promotionResult.evidence.deltaWinRate,
                deltaOutcome:          promotionResult.evidence.deltaOutcome,
                deltaHarmRate:         promotionResult.evidence.deltaHarmRate,
              },
            });
            result.casesCreated++;

            // Auto-apply promotions only when verdict=approve and CHAMPION_AUTO_APPLY=true
            if (AUTO_APPLY && promotionResult.verdict === 'approve') {
              await applyChampionPromotion({
                scopeKey:               market.scopeKey,
                newChampionAction:      topChallenger.actionType,
                previousChampionAction: market.currentChampionAction,
              });
              result.promotionsApplied++;
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`[runChampionMarketScan] error on market ${market.scopeKey}:`, err?.message);
      result.errors++;
    }
  }

  return result;
}

/**
 * lib/system/runGraphPolicyPromotionCycle.ts
 *
 * Orchestrates the full graph-native policy promotion lifecycle:
 *
 *   1. Load open (pending/rejected) GraphPolicyCandidates
 *   2. Evaluate each with evaluateGraphPolicyPromotion
 *   3. For approved/shadow candidates: create or update GraphPolicyRule
 *   4. For active rules: run evaluateGraphPolicyRollback and rollback if needed
 *
 * Run via: POST /api/admin/graph-policy/generate
 * ENV: GRAPH_POLICY_AUTO_PROMOTE=true (default: false) — creates rules from approved candidates
 */
import connectToDatabase              from '@/lib/mongodb';
import GraphPolicyCandidate           from '@/models/GraphPolicyCandidate';
import GraphPolicyRule                from '@/models/GraphPolicyRule';
import GlobalPatternRecord            from '@/models/GlobalPatternRecord';
import { evaluateGraphPolicyPromotion } from './evaluateGraphPolicyPromotion';
import { evaluateGraphPolicyRollback }  from './evaluateGraphPolicyRollback';

const AUTO_PROMOTE = process.env.GRAPH_POLICY_AUTO_PROMOTE === 'true';

export interface PromotionCycleResult {
  candidatesEvaluated: number;
  rulesCreated:        number;
  rollbacksTriggered:  number;
  errors:              number;
}

export async function runGraphPolicyPromotionCycle(): Promise<PromotionCycleResult> {
  await connectToDatabase();
  const result: PromotionCycleResult = { candidatesEvaluated: 0, rulesCreated: 0, rollbacksTriggered: 0, errors: 0 };

  // ── Generate candidates from global patterns ─────────────────────────────
  const patterns = await GlobalPatternRecord.find({
    patternType: { $in: ['success_motif', 'failure_motif'] },
    supportCount: { $gte: 5 },
  }).limit(30).lean() as any[];

  for (const pattern of patterns) {
    try {
      const policyType = pattern.patternType === 'success_motif' ? 'action_boost' : 'action_penalty';
      const candidateKey = `${policyType}::${pattern.patternKey}`;

      const existing = await GraphPolicyCandidate.findOne({ candidateKey });
      if (existing) continue;  // already evaluated

      const evalResult = evaluateGraphPolicyPromotion({
        supportCount:    pattern.supportCount    ?? 0,
        avgOutcomeDelta: pattern.avgOutcomeDelta ?? 0,
        avgConfidence:   pattern.avgConfidence   ?? 0,
        stabilityScore:  pattern.stabilityScore  ?? 0,
        harmRate:        pattern.harmRate        ?? 0,
        familySpread:    1,   // TODO: compute distinct family count from graph
        policyType,
      });

      const actionMatch = pattern.nodePath?.find?.((k: string) => k.startsWith('action::'));
      const targetAction = actionMatch ? actionMatch.replace(/^action::/, '').split('::')[0] : null;

      await GraphPolicyCandidate.create({
        candidateKey,
        sourcePatternKey: pattern.patternKey,
        policyType,
        targetAction,
        proposedValue:   policyType === 'action_boost' ? 12 : -12,
        supportCount:    pattern.supportCount    ?? 0,
        avgOutcomeDelta: pattern.avgOutcomeDelta ?? 0,
        avgConfidence:   pattern.avgConfidence   ?? 0,
        stabilityScore:  pattern.stabilityScore  ?? 0,
        harmRate:        pattern.harmRate        ?? 0,
        promotionScore:  evalResult.promotionScore,
        verdict:         evalResult.verdict === 'approved' ? 'shadow' : evalResult.verdict,
        rationale:       evalResult.rationale,
      });
      result.candidatesEvaluated++;

      // Create rule from approved candidate if AUTO_PROMOTE enabled
      if (AUTO_PROMOTE && evalResult.verdict === 'approved') {
        await GraphPolicyRule.create({
          ruleKey:            `rule::${candidateKey}`,
          sourceCandidateKey: candidateKey,
          policyType,
          targetAction,
          value:              policyType === 'action_boost' ? 12 : -12,
          rolloutMode:        'shadow',
          status:             'shadow',
        }).catch(() => {});   // ignore duplicate on re-run
        result.rulesCreated++;
      }
    } catch { result.errors++; }
  }

  // ── Evaluate rollback for active rules ────────────────────────────────────
  const activeRules = await GraphPolicyRule.find({ status: 'active' }).lean() as any[];
  for (const rule of activeRules) {
    try {
      const rb = evaluateGraphPolicyRollback({
        sampleCount:   rule.performance?.sampleCount   ?? 0,
        hitRate:       rule.performance?.hitRate       ?? 0,
        harmRate:      rule.performance?.harmRate      ?? 0,
        avgDelta:      rule.performance?.avgDelta      ?? 0,
        rollbackScore: rule.performance?.rollbackScore ?? 0,
      });

      await GraphPolicyRule.updateOne(
        { ruleKey: rule.ruleKey },
        { $set: { 'performance.rollbackScore': rb.rollbackScore } }
      );

      if (rb.shouldRollback) {
        await GraphPolicyRule.updateOne(
          { ruleKey: rule.ruleKey },
          { $set: { status: 'rolled_back', lastRolledBackAt: new Date() } }
        );
        await GraphPolicyCandidate.updateOne(
          { candidateKey: rule.sourceCandidateKey },
          { $set: { verdict: 'rolled_back' } }
        );
        result.rollbacksTriggered++;
      }
    } catch { result.errors++; }
  }

  return result;
}

/**
 * lib/system/runReplayWeightUpdateCycle.ts
 *
 * Orchestrates the full replay → weight update pipeline.
 *
 * Flow:
 *   1. Load recent completed replay sessions (past 48h)
 *   2. Aggregate variant evidence by type
 *   3. Compute weight proposals using bounded updater
 *   4. Run safety gate on each proposal
 *   5. Find or create AdaptiveWeightProfile for scope
 *   6. Create ReplayWeightUpdateCandidate with verdict
 *   7. If verdict = shadow/approved: apply to profile immediately in shadow mode
 *
 * ENV: ADAPTIVE_WEIGHT_AUTO_APPLY=false (default — create candidates only)
 */
import connectToDatabase              from '@/lib/mongodb';
import DecisionReplaySession          from '@/models/system/DecisionReplaySession';
import DecisionReplayVariant          from '@/models/system/DecisionReplayVariant';
import AdaptiveWeightProfile          from '@/models/system/AdaptiveWeightProfile';
import ReplayWeightUpdateCandidate    from '@/models/system/ReplayWeightUpdateCandidate';
import { aggregateReplayWeightEvidence } from './aggregateReplayWeightEvidence';
import { computeReplayWeightProposal }   from './computeReplayWeightProposal';
import { evaluateReplayWeightSafetyGate, applyAdaptiveWeightProfile } from './evaluateReplayWeightSafetyGate';

const AUTO_APPLY = process.env.ADAPTIVE_WEIGHT_AUTO_APPLY === 'true';

export async function runReplayWeightUpdateCycle(): Promise<{
  sessionsScanned:   number;
  candidatesCreated: number;
  profilesUpdated:   number;
}> {
  await connectToDatabase();

  // 1. Load recent completed sessions
  const cutoff  = new Date(Date.now() - 48 * 3_600_000);
  const sessions = await DecisionReplaySession.find({
    status:    'completed',
    createdAt: { $gte: cutoff },
  }).lean() as any[];

  let candidatesCreated = 0;
  let profilesUpdated   = 0;

  for (const session of sessions) {
    // 2. Load variants for this session
    const variants = await DecisionReplayVariant.find({ sessionKey: session.sessionKey }).lean() as any[];
    if (!variants.length) continue;

    // 3. Aggregate evidence
    const evidence = aggregateReplayWeightEvidence({ variants });

    // Build scope key from session baseline
    const anomalyType    = session.baselineSnapshot?.anomalyType    ?? '*';
    const lifecycleStage = session.baselineSnapshot?.lifecycleStage ?? '*';
    const trustTier      = session.baselineSnapshot?.trustTier      ?? '*';
    const profileKey     = `${anomalyType}::${lifecycleStage}::${trustTier}`;

    // 4. Find or create profile
    let profile = await AdaptiveWeightProfile.findOne({ profileKey }).lean() as any;
    if (!profile) {
      profile = await AdaptiveWeightProfile.create({
        profileKey,
        scopeSelector: { anomalyType, lifecycleStage, trustTier },
      });
      profile = profile.toObject();
    }

    // 5. Generate proposal per evidence bucket
    for (const bucket of evidence) {
      if (bucket.supportCount < 5) continue;

      const proposal = computeReplayWeightProposal({
        currentValue:       profile[bucket.variantType] ?? 1.0,
        variantType:        bucket.variantType,
        winRate:            bucket.winRate,
        avgReplayAdvantage: bucket.avgReplayAdvantage,
        supportCount:       bucket.supportCount,
        avgConfidence:      bucket.avgConfidence,
      });
      if (!proposal || proposal.delta === 0) continue;

      // 6. Safety gate
      const gate = evaluateReplayWeightSafetyGate({
        supportCount: bucket.supportCount,
        confidence:   proposal.confidence,
        harmRisk:     proposal.harmRisk,
        targetField:  proposal.targetField,
      });

      if (gate.verdict === 'rejected') continue;

      const candidateKey = `${profileKey}::${proposal.targetField}::${Date.now()}`;
      await ReplayWeightUpdateCandidate.create({
        candidateKey,
        profileKey,
        sourceSessionKey: session.sessionKey,
        updateType:       proposal.updateType,
        targetField:      proposal.targetField,
        currentValue:     profile[proposal.targetField] ?? 1.0,
        proposedValue:    proposal.proposedValue,
        delta:            proposal.delta,
        supportCount:     bucket.supportCount,
        avgReplayAdvantage: bucket.avgReplayAdvantage,
        confidence:       proposal.confidence,
        harmRisk:         proposal.harmRisk,
        verdict:          gate.verdict,
        rationale:        `${proposal.rationale} | Gate: ${gate.rationale}`,
      });
      candidatesCreated++;

      // 7. Auto-apply if enabled and gate approved/shadow
      if (AUTO_APPLY && (gate.verdict === 'approved' || gate.verdict === 'shadow')) {
        await applyAdaptiveWeightProfile({
          profileKey,
          field:      proposal.targetField,
          value:      proposal.proposedValue,
          rolloutMode:'shadow',
        });
        profilesUpdated++;
      }
    }
  }

  return { sessionsScanned: sessions.length, candidatesCreated, profilesUpdated };
}

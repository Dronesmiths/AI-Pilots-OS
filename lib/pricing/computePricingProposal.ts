/**
 * lib/pricing/computePricingProposal.ts
 *
 * Performance-based pricing engine.
 *
 * 1. Compute performance score from real Nova signals
 * 2. Calculate proposed price within constraint guardrails
 * 3. Generate client-facing explanation
 * 4. Apply auto-apply rules
 * 5. Create NovaPricingProposal record
 *
 * Performance score formula (0.0 → 1.0):
 *   score =  roiChange         × 0.40
 *          + successRate        × 0.30
 *          + riskReduction      × 0.20
 *          + consistency        × 0.10
 *          + guaranteeBonus     (if guarantee met or ahead of pace)
 *
 * Price formula:
 *   rawDelta   = score × performanceMultiplier × basePrice
 *   proposedPrice = clamp(basePrice + rawDelta, floor, ceiling)
 *
 * In hybrid mode: only the performance bonus above basePrice is variable.
 * In fixed mode: no change proposed.
 * In performance mode: price can go below basePrice (symmetrical).
 */
import connectToDatabase               from '@/lib/mongodb';
import { NovaPricingProfile, NovaPricingProposal } from '@/models/pricing/NovaPricingProfile';
import { NovaBoardMemory }             from '@/models/boardroom/NovaBoardMemory';
import { NovaStrategicResolution }     from '@/models/boardroom/NovaStrategicResolution';
import { NovaROIGuarantee }            from '@/models/guarantee/NovaROIGuarantee';
import { emitEvent }                   from '@/lib/events/emitEvent';

// ── Score computation ─────────────────────────────────────────────────────────
async function computePerformanceScore(tenantId: string): Promise<{
  total: number;
  components: { roiWeight: number; successRateWeight: number; riskReductionWeight: number; consistencyWeight: number; guaranteeBonus: number };
  raw: { roiChange: number; successRate: number; riskReduction: number };
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [memory, resolutions, guarantee] = await Promise.all([
    NovaBoardMemory.find({ tenantId, measured: true, createdAt: { $gte: thirtyDaysAgo } }).sort({ createdAt: -1 }).limit(30).lean(),
    NovaStrategicResolution.find({ tenantId, createdAt: { $gte: thirtyDaysAgo } }).lean(),
    NovaROIGuarantee.findOne({ tenantId, status: { $in: ['active','met','extended'] } }).lean(),
  ]);

  // ROI change: average outcome score from board memory
  const avgROI = memory.length
    ? memory.reduce((s: number, m: any) => s + (m.outcomeScore ?? 0), 0) / memory.length
    : 0;

  // Success rate: approved / total resolutions
  const approved    = resolutions.filter((r: any) => ['approved','executed'].includes(r.status)).length;
  const successRate = resolutions.length > 0 ? approved / resolutions.length : 0.5;

  // Risk reduction: proportion of mitigations successfully applied (proxy: inverse of open anomalies)
  // Simple proxy: if successRate > 0.7, risk is being managed
  const riskReduction = successRate > 0.7 ? 0.8 : successRate > 0.5 ? 0.5 : 0.2;

  // Consistency: are recent memory scores trending up?
  const recent = memory.slice(0, 7).map((m: any) => m.outcomeScore ?? 0);
  const older  = memory.slice(7, 14).map((m: any) => m.outcomeScore ?? 0);
  const recentAvg = recent.length ? recent.reduce((a,b)=>a+b,0)/recent.length : 0;
  const olderAvg  = older.length  ? older.reduce((a,b)=>a+b,0)/older.length   : 0;
  const consistency = recentAvg >= olderAvg ? 0.8 : 0.4;

  // Guarantee bonus: if guarantee is active and ahead of pace, add 0.1
  let guaranteeBonus = 0;
  if (guarantee) {
    const g = guarantee as any;
    if (g.status === 'met') guaranteeBonus = 0.15;
    else if (g.progressPct && g.targetPct) {
      const pace = g.progressPct / g.targetPct;
      if (pace >= 1.0) guaranteeBonus = 0.15;
      else if (pace >= 0.8) guaranteeBonus = 0.08;
    }
  }

  const roiWeight          = Math.max(-0.5, Math.min(1.0, avgROI))         * 0.40;
  const successRateWeight  = successRate                                      * 0.30;
  const riskReductionWeight = riskReduction                                   * 0.20;
  const consistencyWeight  = consistency                                      * 0.10;
  const total = Math.max(-0.3, Math.min(1.0, roiWeight + successRateWeight + riskReductionWeight + consistencyWeight + guaranteeBonus));

  return {
    total,
    components: { roiWeight, successRateWeight, riskReductionWeight, consistencyWeight, guaranteeBonus },
    raw: { roiChange: avgROI, successRate, riskReduction },
  };
}

// ── Explanation generator ─────────────────────────────────────────────────────
function buildExplanation(params: {
  current: number; proposed: number; score: number;
  raw: { roiChange: number; successRate: number };
  mode: string;
}): string {
  const { current, proposed, score, raw } = params;
  const dir = proposed > current ? 'increase' : 'decrease';
  const pct = Math.abs(((proposed - current) / current) * 100).toFixed(0);
  const roi = (raw.roiChange * 100).toFixed(0);
  const sRate = (raw.successRate * 100).toFixed(0);

  if (score <= 0.1) return `Nova's performance this period was below the threshold for a pricing adjustment. Your plan remains at $${current}/month.`;

  if (proposed > current) {
    return `Based on ${roi}% ROI improvement and a ${sRate}% decision success rate over the last 30 days, Nova is recommending a $${(proposed - current).toFixed(0)}/month ${dir} — reflecting the additional value delivered. This represents a ${pct}% adjustment from your current plan.`;
  } else {
    return `Nova's performance this period didn't meet the threshold for a price increase. In keeping with our performance-aligned pricing, we're recommending a $${(current - proposed).toFixed(0)}/month reduction to stay aligned with delivered value.`;
  }
}

// ── Main: compute + save proposal ────────────────────────────────────────────
export async function computePricingProposal(tenantId: string): Promise<typeof NovaPricingProposal.prototype | null> {
  await connectToDatabase();

  // Load or create profile
  let profile = await NovaPricingProfile.findOne({ tenantId }).lean();
  if (!profile) {
    const created = await NovaPricingProfile.create({ tenantId, basePrice: 99, currentPrice: 99, pricingMode: 'hybrid' });
    profile = created.toObject();
  }

  if ((profile as any).pricingMode === 'fixed') return null;

  // Cooldown check
  if ((profile as any).lastAdjustedAt) {
    const daysSince = (Date.now() - new Date((profile as any).lastAdjustedAt).getTime()) / 86400000;
    if (daysSince < (profile as any).minDaysBetweenChanges) return null;
  }

  // Compute score
  const { total: score, components, raw } = await computePerformanceScore(tenantId);

  const base      = (profile as any).basePrice;
  const current   = (profile as any).currentPrice;
  const multiplier = (profile as any).performanceMultiplier;
  const ceiling   = base * (1 + (profile as any).maxIncreasePct);
  const floor     = base * (1 - (profile as any).maxDecreasePct);

  // In hybrid mode: only surplus above base is variable
  const rawProposed = (profile as any).pricingMode === 'performance'
    ? base + (score * multiplier * base)
    : base + Math.max(0, score * multiplier * base);  // hybrid: no below-base

  const proposed = parseFloat(Math.max(floor, Math.min(ceiling, rawProposed)).toFixed(2));

  // No proposal if change is trivial (< $2)
  if (Math.abs(proposed - current) < 2) return null;

  const delta    = parseFloat((proposed - current).toFixed(2));
  const deltaPct = parseFloat((delta / current).toFixed(4));
  const explanation = buildExplanation({ current, proposed, score, raw, mode: (profile as any).pricingMode });

  // Auto-apply eligibility: small increase, high confidence, positive score
  const autoApplyEligible = delta > 0 && delta < (profile as any).autoApplyIfIncreaseLt && score > 0.6;

  const proposalKey = `${tenantId}::pricing::${Date.now()}`;
  const proposal = await NovaPricingProposal.create({
    proposalKey, tenantId,
    currentPrice: current, proposedPrice: proposed, delta, deltaPct,
    performanceScore: score, scoreComponents: components,
    explanation, status: autoApplyEligible ? 'auto_applied' : 'pending',
    autoApplyEligible,
  });

  // Auto-apply: update profile immediately
  if (autoApplyEligible) {
    await NovaPricingProfile.updateOne(
      { tenantId },
      { $set: { currentPrice: proposed, lastAdjustedAt: new Date(), lastPerformanceScore: score } }
    );
    await NovaPricingProposal.updateOne({ proposalKey }, { $set: { appliedAt: new Date() } });
    void emitEvent({ tenantId, type:'policy_change', title:`Pricing auto-adjusted to $${proposed}/month`, description:explanation, severity:'info' });
  } else {
    void emitEvent({ tenantId, type:'policy_change', title:`Pricing proposal: $${current} → $${proposed}/month`, description:`Awaiting approval. ${explanation}`, severity:'info' });
  }

  // Save score on profile
  await NovaPricingProfile.updateOne({ tenantId }, { $set: { lastPerformanceScore: score } });

  return proposal;
}

// ── Apply approved proposal ───────────────────────────────────────────────────
export async function applyPricingProposal(proposalKey: string): Promise<boolean> {
  await connectToDatabase();
  const proposal = await NovaPricingProposal.findOne({ proposalKey, status:'pending' }).lean();
  if (!proposal) return false;

  await NovaPricingProfile.updateOne(
    { tenantId: (proposal as any).tenantId },
    { $set: { currentPrice: (proposal as any).proposedPrice, lastAdjustedAt: new Date(), lastPerformanceScore: (proposal as any).performanceScore } }
  );
  await NovaPricingProposal.updateOne({ proposalKey }, { $set: { status:'approved', approvedAt: new Date(), appliedAt: new Date() } });
  return true;
}

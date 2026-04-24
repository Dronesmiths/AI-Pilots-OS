/**
 * lib/engine/getRecentDroneActivity.ts
 *
 * Builds the AI Activity feed from real Mongo sources:
 *   1. GeneratedPage/Article/ContentDraft — pages created this week
 *   2. BanditArmPull — AI decisions
 *   3. ArmCausalAttribution — validated causal improvements
 *   4. AnomalyResponseBandit — active engines
 *
 * Returns ActivityItem[] conforming to types/dashboard.ts.
 * Cache: 10s TTL (activity feed should feel near-live).
 */
import connectToDatabase       from '@/lib/mongodb';
import AnomalyResponseBandit   from '@/models/governance/AnomalyResponseBandit';
import BanditArmPull           from '@/models/governance/BanditArmPull';
import { cacheKeys }           from '@/lib/cache/cacheKeys';
import { withCache }           from '@/lib/cache/withCache';
import type { ActivityItem }   from '@/types/dashboard';

async function fetchDroneActivity(domain: string): Promise<ActivityItem[]> {
  await connectToDatabase();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);

  const [recentPulls, allBandits] = await Promise.all([
    BanditArmPull.find({ selectedAt: { $gte: sevenDaysAgo } })
      .select('selectedAt anomalyType')
      .sort({ selectedAt: -1 })
      .limit(200)
      .lean() as Promise<any[]>,
    AnomalyResponseBandit.find({ active: true })
      .select('lifecycle anomalyType')
      .lean() as Promise<any[]>,
  ]);

  // Optional: causal attributions
  let positiveCausal = 0;
  try {
    const mongoose = (await import('mongoose')).default;
    if (mongoose.modelNames().includes('ArmCausalAttribution')) {
      positiveCausal = await mongoose.model('ArmCausalAttribution').countDocuments({
        createdAt: { $gte: sevenDaysAgo },
        'causalImpact.overallCausalScore': { $gt: 0 },
      });
    }
  } catch { /* not yet available */ }

  // Optional: pages from content models
  let pagesCreated = 0;
  try {
    const mongoose = (await import('mongoose')).default;
    for (const name of ['GeneratedPage', 'Article', 'SeoPage', 'ContentDraft']) {
      if (mongoose.modelNames().includes(name)) {
        pagesCreated = await mongoose.model(name).countDocuments({ createdAt: { $gte: sevenDaysAgo } });
        if (pagesCreated > 0) break;
      }
    }
  } catch { /* not yet available */ }

  const totalDecisions = recentPulls.length;
  const liveBandits    = allBandits.filter(b => b.lifecycle?.status === 'live').length;
  const anomalyTypes   = [...new Set(recentPulls.map(p => p.anomalyType).filter(Boolean))].length;
  const latestPullTs   = recentPulls[0]?.selectedAt?.toISOString?.() ?? new Date().toISOString();

  const items: ActivityItem[] = [];

  if (pagesCreated > 0)
    items.push({ id: 'pages',     icon: '📄', label: `${pagesCreated} new pages created this week`,          sub: 'Targeting your highest-value keywords',                 ts: latestPullTs });

  if (totalDecisions > 0)
    items.push({ id: 'decisions', icon: '🧠', label: `${totalDecisions} AI decisions made this week`,         sub: `Across ${anomalyTypes} optimization patterns`,          ts: latestPullTs });

  if (liveBandits > 0)
    items.push({ id: 'live',      icon: '⚡', label: `${liveBandits} live optimization engines running`,      sub: 'Selecting the best actions in real time',               ts: new Date().toISOString() });

  if (positiveCausal > 0)
    items.push({ id: 'causal',    icon: '📊', label: `${positiveCausal} positive causal impacts validated`,   sub: 'Evidence-based improvements confirmed',                 ts: new Date().toISOString() });

  if (allBandits.length > liveBandits)
    items.push({ id: 'shadow',    icon: '🔬', label: `${allBandits.length - liveBandits} strategies in shadow testing`, sub: 'New approaches evaluated safely before going live', ts: new Date().toISOString() });

  items.push({ id: 'safety',   icon: '🛡', label: 'Safety checks running on every decision',                sub: 'Harmful outcomes automatically filtered',              ts: new Date().toISOString() });
  items.push({ id: 'learning', icon: '🔄', label: 'Multi-armed bandit continuously learning',              sub: 'Every decision improves future choices',               ts: new Date().toISOString() });

  return items.slice(0, 7);
}

export async function getRecentDroneActivity(domain: string): Promise<ActivityItem[]> {
  return withCache({
    key:   cacheKeys.activityFeed(domain),
    ttlMs: 10_000, // 10s — near-live
    loader: () => fetchDroneActivity(domain),
  });
}

/** Bust activity cache when a new page is published / drone completes */
export function invalidateActivityFeed(domain: string): void {
  const { deleteCache } = require('@/lib/cache/memoryCache');
  deleteCache(cacheKeys.activityFeed(domain));
}

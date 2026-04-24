/**
 * lib/engine/getEngineStats.ts
 *
 * Reads engine-level stats from Mongo for the client dashboard.
 * Sources:
 *   1. DashboardClientState — autopilot, domain, onboarding
 *   2. Content models — pages created count
 *   3. BanditArmPull — decisions this week + live bandits
 *   4. GSC keywordsGrowing (if available from getGSCData)
 *
 * Cache: 15s TTL (near-real-time for system status)
 */
import connectToDatabase    from '@/lib/mongodb';
import DashboardClientState from '@/models/client/DashboardClientState';
import AnomalyResponseBandit from '@/models/governance/AnomalyResponseBandit';
import BanditArmPull         from '@/models/governance/BanditArmPull';
import { cacheKeys }         from '@/lib/cache/cacheKeys';
import { withCache }         from '@/lib/cache/withCache';

export interface EngineStats {
  siteName:        string;
  domain:          string;
  autopilotEnabled:boolean;
  autopilotMode:   'aggressive' | 'balanced' | 'safe';
  systemLive:      boolean;
  keywordsGrowing: number | null;
  pagesCreated:    number | null;
  decisionsThisWeek:   number;
  decisionsLastMinute: number;
  liveBandits:     number;
  activeBandits:   number;
}

async function fetchEngineStats(domain: string): Promise<EngineStats> {
  await connectToDatabase();

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const thirtyDaysAgo= new Date(Date.now() - 30 * 86400_000);
  const oneMinuteAgo = new Date(Date.now() - 60_000);

  const [clientState, allBandits, weekPulls, minutePulls] = await Promise.all([
    DashboardClientState.findOne({ domain }).lean() as Promise<any>,
    AnomalyResponseBandit.find({ active: true }).select('lifecycle').lean() as Promise<any[]>,
    BanditArmPull.countDocuments({ selectedAt: { $gte: sevenDaysAgo } }),
    BanditArmPull.countDocuments({ selectedAt: { $gte: oneMinuteAgo } }),
  ]);

  // Pages created — check whichever content model exists
  let pagesCreated: number | null = null;
  try {
    const mongoose = (await import('mongoose')).default;
    for (const name of ['GeneratedPage', 'Article', 'SeoPage', 'ContentDraft']) {
      if (mongoose.modelNames().includes(name)) {
        pagesCreated = await mongoose.model(name).countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
        if (pagesCreated > 0 || pagesCreated === 0) break; // stop on first registered model
      }
    }
  } catch { /* model not registered yet */ }

  const liveBandits   = allBandits.filter(b => b.lifecycle?.status === 'live').length;
  const activeBandits = allBandits.length;

  return {
    siteName:            clientState?.siteName ?? (domain ? domain.replace(/^www\./, '') : 'Your Site'),
    domain:              domain,
    autopilotEnabled:    clientState?.autopilotOn   ?? true,
    autopilotMode:      (clientState?.autopilotMode ?? 'balanced') as 'aggressive'|'balanced'|'safe',
    systemLive:          (clientState?.onboarding?.step ?? 1) >= 3,
    keywordsGrowing:     null, // populated from GSC in bootstrap
    pagesCreated:        pagesCreated,
    decisionsThisWeek:   weekPulls,
    decisionsLastMinute: minutePulls,
    liveBandits,
    activeBandits,
  };
}

export async function getEngineStats(domain: string): Promise<EngineStats> {
  return withCache({
    key:   cacheKeys.engineStats(domain),
    ttlMs: 15_000, // 15s — near-real-time
    loader: () => fetchEngineStats(domain),
  });
}

/** Call after autopilot toggle or onboarding changes to bust the engine cache */
export function invalidateEngineStats(domain: string): void {
  const { deleteCache } = require('@/lib/cache/memoryCache');
  deleteCache(cacheKeys.engineStats(domain));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/dashboard/bootstrap/route.ts  (wired to real data)
 *
 * Single source of truth for the client dashboard initial load.
 * All data sourced from real integrations:
 *   - GSC → impressions, clicks, keyword wins (via googleapis, SWR-cached 15/30min)
 *   - Mongo → bandit stats, activity, DashboardClientState (withCache 10-15s)
 *   - KeywordWin model → DB-stored wins (from drone/GSC sync)
 *
 * meta.lastSequence is included so the client opens SSE with ?after=lastSequence,
 * bridging the gap between this snapshot and live events.
 *
 * Response: DashboardBootstrap (see types/dashboard.ts)
 *
 * Cache header: private, s-maxage=30, stale-while-revalidate=120
 */
import { NextRequest, NextResponse }   from 'next/server';
import { cookies }                     from 'next/headers';
import connectToDatabase               from '@/lib/mongodb';
import DashboardClientState            from '@/models/client/DashboardClientState';
import KeywordWin                      from '@/models/client/KeywordWin';
import { getGSCData }                  from '@/lib/gsc/getGSCData';
import { getKeywordWins }              from '@/lib/gsc/getKeywordWins';
import { getEngineStats }              from '@/lib/engine/getEngineStats';
import { getRecentDroneActivity }      from '@/lib/engine/getRecentDroneActivity';
import { getLastSequence }             from '@/lib/events/persistDashboardEvent';
import type { DashboardBootstrap }     from '@/types/dashboard';

export const dynamic = 'force-dynamic';

async function getDomain(req: NextRequest): Promise<string | null> {
  const cs = await cookies();
  return req.nextUrl.searchParams.get('domain') ?? cs.get('portal_domain')?.value ?? null;
}

export async function GET(req: NextRequest) {
  const domain = await getDomain(req);
  await connectToDatabase();

  // ── Parallel: all data sources concurrently ─────────────────────────────────
  // GSC calls use SWR cache (15/30 min) — they never block page load on cache hit
  // Engine/activity calls use withCache (10-15s) — near-real-time Mongo reads
  const [gscData, gscWins, engineStats, activityItems, clientState, dbWins, lastSequence] = await Promise.all([
    getGSCData(),                                  // SWR: 15min stale / 30min TTL
    getKeywordWins(),                              // SWR: 30min stale / 60min TTL
    domain ? getEngineStats(domain) : null,        // withCache: 15s TTL
    domain ? getRecentDroneActivity(domain) : [],  // withCache: 10s TTL
    domain ? DashboardClientState.findOne({ domain }).lean() as Promise<any> : null,
    domain ? KeywordWin.find({ domain }).sort({ weekStart: -1, impressionsLift: -1 }).limit(6).lean() as Promise<any[]> : [],
    domain ? getLastSequence(domain) : Promise.resolve(0),  // replay cursor
  ]);

  // ── Merge wins: DB wins first (drone-recorded), then GSC-computed wins ──────
  // DB wins have notes + clicksLift. GSC wins fill in if no DB wins exist yet.
  let wins: DashboardBootstrap['wins'];

  if ((dbWins as any[]).length > 0) {
    wins = (dbWins as any[]).map((w: any) => ({
      id:             String(w._id),
      keyword:        w.keyword,
      oldPosition:    w.oldPosition,
      newPosition:    w.newPosition,
      impressionsLift:w.impressionsLift,
      clicksLift:     w.clicksLift ?? 0,
      weekStart:      new Date(w.weekStart).toISOString(),
      notes:          w.notes ?? '',
    }));
  } else {
    // Fall back to live GSC-computed wins when no drone-recorded wins exist yet
    wins = gscWins.map(w => ({
      id:             `gsc-${w.keyword.replace(/\s+/g, '-')}`,
      keyword:        w.keyword,
      oldPosition:    w.oldPosition,
      newPosition:    w.newPosition,
      impressionsLift:w.impressionsLift,
      clicksLift:     0,
      weekStart:      w.weekStart,
      notes:          '',
    }));
  }

  // ── Onboarding state ────────────────────────────────────────────────────────
  const obState = clientState?.onboarding;
  const onboarding: DashboardBootstrap['onboarding'] = {
    domainConnected: !!(clientState?.domain),
    gscConnected:     obState?.gscConnected    ?? false,
    engineLaunched:   obState?.engineLaunched  ?? false,
    step:             obState?.step            ?? 1,
    domain:           domain ?? '',
  };

  // ── Summary: merge GSC + engine + onboarding ────────────────────────────────
  const es = engineStats;
  const summary: DashboardBootstrap['summary'] = {
    siteName:            es?.siteName            ?? (domain?.replace(/^www\./, '') ?? 'Your Site'),
    domain:              domain                  ?? '',
    autopilotEnabled:    es?.autopilotEnabled    ?? true,
    autopilotMode:      (es?.autopilotMode       ?? 'balanced') as 'aggressive'|'balanced'|'safe',
    systemLive:          es?.systemLive          ?? false,
    impressions:         gscData?.impressions    ?? null,
    impressionsDeltaPct: gscData?.impressionsDelta ?? null,
    clicks:              gscData?.clicks         ?? null,
    clicksDeltaPct:      gscData?.clicksDelta    ?? null,
    keywordsGrowing:     gscWins.length > 0 ? gscWins.length : null,
    pagesCreated:        es?.pagesCreated        ?? null,
    aiStatusText:        (es?.decisionsThisWeek ?? 0) > 0
      ? 'AI is actively optimizing your site'
      : 'AI engine warming up',
    decisionsThisWeek:   es?.decisionsThisWeek   ?? 0,
    decisionsLastMinute: es?.decisionsLastMinute  ?? 0,
    liveBandits:         es?.liveBandits          ?? 0,
    activeBandits:       es?.activeBandits        ?? 0,
  };

  const bootstrap: DashboardBootstrap = {
    summary,
    activity: activityItems,
    wins,
    onboarding,
    meta: { generatedAt: Date.now(), snapshotSequence: lastSequence ?? 0 },
  };

  return NextResponse.json(bootstrap, {
    headers: {
      // Browser and CDN can serve stale while this revalidates on next request
      'Cache-Control': 'private, s-maxage=30, stale-while-revalidate=120',
    },
  });
}

/**
 * lib/gsc/getGSCData.ts
 *
 * Fetches impressions + clicks from Google Search Console searchAnalytics.
 * Compares two 28-day windows to produce delta percentages.
 *
 * Cache strategy:
 *   - stale-while-revalidate: 15min stale / 30min TTL
 *   - coalesced: concurrent requests share one real GSC call
 *   - timed: slow fetches are logged
 *
 * Gracefully returns null metrics when GSC_SITE_URL is not set or the
 * service account has no access — the dashboard shows "connect GSC" banner.
 */
import { getGSCClient, getDefaultSiteUrl } from './gscClient';
import { cacheKeys }               from '@/lib/cache/cacheKeys';
import { staleWhileRevalidate }    from '@/lib/cache/staleWhileRevalidate';
import { coalesce }                from '@/lib/perf/requestCoalescer';
import { timed }                   from '@/lib/perf/timing';

export interface GSCSummary {
  impressions:      number;
  clicks:           number;
  impressionsDelta: number; // fractional — multiply by 100 for %
  clicksDelta:      number;
  topQueries:       string[];
}

function dateStr(d: Date): string { return d.toISOString().slice(0, 10); }

async function fetchGSCSummary(siteUrl: string): Promise<GSCSummary> {
  const sc  = getGSCClient();
  const now = new Date();

  // Current window: last 28 days
  const curEnd   = new Date(now); curEnd.setDate(now.getDate() - 3); // GSC has 3-day lag
  const curStart = new Date(curEnd); curStart.setDate(curEnd.getDate() - 27);

  // Previous window: 28 days before the current window
  const prevEnd   = new Date(curStart); prevEnd.setDate(curStart.getDate() - 1);
  const prevStart = new Date(prevEnd);  prevStart.setDate(prevEnd.getDate() - 27);

  const [curRes, prevRes] = await Promise.all([
    sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: dateStr(curStart),
        endDate:   dateStr(curEnd),
        dimensions: ['query'],
        rowLimit:   1000,
      },
    }),
    sc.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: dateStr(prevStart),
        endDate:   dateStr(prevEnd),
        dimensions: ['query'],
        rowLimit:   1000,
      },
    }),
  ]);

  const curRows  = curRes.data.rows  ?? [];
  const prevRows = prevRes.data.rows ?? [];

  const curImpressions  = curRows.reduce((s, r)  => s + (r.impressions ?? 0), 0);
  const curClicks       = curRows.reduce((s, r)  => s + (r.clicks      ?? 0), 0);
  const prevImpressions = prevRows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const prevClicks      = prevRows.reduce((s, r) => s + (r.clicks      ?? 0), 0);

  const impressionsDelta = prevImpressions > 0
    ? (curImpressions - prevImpressions) / prevImpressions
    : 0;
  const clicksDelta = prevClicks > 0
    ? (curClicks - prevClicks) / prevClicks
    : 0;

  // Top 5 queries by impressions (for future "top keywords" section)
  const topQueries = curRows
    .sort((a, b) => (b.impressions ?? 0) - (a.impressions ?? 0))
    .slice(0, 5)
    .map(r => r.keys?.[0] ?? '');

  return { impressions: Math.round(curImpressions), clicks: Math.round(curClicks), impressionsDelta, clicksDelta, topQueries };
}

export async function getGSCData(siteUrl?: string): Promise<GSCSummary | null> {
  let url: string;
  try { url = siteUrl ?? getDefaultSiteUrl(); } catch { return null; }

  const key = cacheKeys.gscSummary(url);

  try {
    return await staleWhileRevalidate<GSCSummary>({
      key,
      ttlMs:   30 * 60_000,  // 30 min TTL
      staleMs: 15 * 60_000,  // refresh after 15 min
      loader:  () => coalesce(key, () => timed('gsc:summary', () => fetchGSCSummary(url))),
    });
  } catch (err) {
    console.error('[gsc] getGSCData failed:', err);
    return null;
  }
}

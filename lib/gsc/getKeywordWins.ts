/**
 * lib/gsc/getKeywordWins.ts
 *
 * Detects keyword position improvements from GSC by comparing:
 *   current window  (last 28 days, excluding 3-day GSC lag)
 *   previous window (the 28 days before that)
 *
 * A "win" is a keyword where:
 *   - both windows have impressions > 0
 *   - position improved (newPos < oldPos)
 *   - improvement is >= MIN_POSITION_GAIN ranks
 *
 * Returns top 6 wins sorted by position gain, with estimated impressions lift.
 *
 * Cache: 30min stale / 60min TTL (wins don't change by the minute)
 */
import { getGSCClient, getDefaultSiteUrl } from './gscClient';
import { cacheKeys }            from '@/lib/cache/cacheKeys';
import { staleWhileRevalidate } from '@/lib/cache/staleWhileRevalidate';
import { coalesce }             from '@/lib/perf/requestCoalescer';
import { timed }                from '@/lib/perf/timing';

export interface KeywordWin {
  keyword:        string;
  oldPosition:    number;
  newPosition:    number;
  impressionsLift:number;
  weekStart:      string; // ISO date of current window start
}

const MIN_POSITION_GAIN = 2; // ignore tiny fluctuations
const ROW_LIMIT         = 500;

function dateStr(d: Date): string { return d.toISOString().slice(0, 10); }

async function fetchKeywordWins(siteUrl: string): Promise<KeywordWin[]> {
  const sc  = getGSCClient();
  const now = new Date();

  const curEnd   = new Date(now); curEnd.setDate(now.getDate() - 3);
  const curStart = new Date(curEnd); curStart.setDate(curEnd.getDate() - 27);
  const prevEnd  = new Date(curStart); prevEnd.setDate(curStart.getDate() - 1);
  const prevStart= new Date(prevEnd); prevStart.setDate(prevEnd.getDate() - 27);

  const [curRes, prevRes] = await Promise.all([
    sc.searchanalytics.query({
      siteUrl,
      requestBody: { startDate: dateStr(curStart), endDate: dateStr(curEnd), dimensions: ['query'], rowLimit: ROW_LIMIT },
    }),
    sc.searchanalytics.query({
      siteUrl,
      requestBody: { startDate: dateStr(prevStart), endDate: dateStr(prevEnd), dimensions: ['query'], rowLimit: ROW_LIMIT },
    }),
  ]);

  // Build lookup map for previous window: keyword → { position, impressions }
  const prevMap = new Map<string, { position: number; impressions: number }>();
  for (const r of prevRes.data.rows ?? []) {
    const kw = r.keys?.[0];
    if (kw) prevMap.set(kw, { position: r.position ?? 100, impressions: r.impressions ?? 0 });
  }

  const wins: KeywordWin[] = [];

  for (const r of curRes.data.rows ?? []) {
    const kw = r.keys?.[0];
    if (!kw) continue;

    const prev = prevMap.get(kw);
    if (!prev) continue; // new keyword — no comparison possible

    const newPos = Math.round(r.position ?? 100);
    const oldPos = Math.round(prev.position);
    const gain   = oldPos - newPos;

    if (gain < MIN_POSITION_GAIN) continue;

    const impressionsLift = Math.round((r.impressions ?? 0) - prev.impressions);

    wins.push({
      keyword:         kw,
      oldPosition:     oldPos,
      newPosition:     newPos,
      impressionsLift: Math.max(0, impressionsLift),
      weekStart:       dateStr(curStart),
    });
  }

  // Sort by gain descending, return top 6
  return wins
    .sort((a, b) => (b.oldPosition - b.newPosition) - (a.oldPosition - a.newPosition))
    .slice(0, 6);
}

export async function getKeywordWins(siteUrl?: string): Promise<KeywordWin[]> {
  let url: string;
  try { url = siteUrl ?? getDefaultSiteUrl(); } catch { return []; }

  const key = cacheKeys.gscWins(url);

  try {
    return await staleWhileRevalidate<KeywordWin[]>({
      key,
      ttlMs:   60 * 60_000,  // 60 min TTL
      staleMs: 30 * 60_000,  // refresh after 30 min
      loader:  () => coalesce(key, () => timed('gsc:wins', () => fetchKeywordWins(url))),
    });
  } catch (err) {
    console.error('[gsc] getKeywordWins failed:', err);
    return [];
  }
}

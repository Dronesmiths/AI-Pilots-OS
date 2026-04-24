import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { google } from 'googleapis';

export const maxDuration = 300;

/**
 * POST /api/admin/seo/sync-page-metrics
 * Pulls real Search Console data for all published clusters.
 * Falls back to DataForSEO rank tracker if GSC unconfigured.
 */
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

    const client = await User.findById(tenantId);
    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const publishedClusters = (client.seoClusters || []).filter(
      (c: any) => ['published', 'Live'].includes(c.status) && c.liveUrl
    );

    if (publishedClusters.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'No published pages yet.' });
    }

    let synced = 0;
    const now = new Date();

    // ── GSC Path ─────────────────────────────────────────────────────────────
    if (client.googleRefreshToken) {
      try {
        const oauth2 = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2.setCredentials({ refresh_token: client.googleRefreshToken });

        const sc = google.searchconsole({ version: 'v1', auth: oauth2 });
        const siteUrl = client.targetDomain || `https://${client.githubRepo}`;

        // Pull last 28 days of data for all published URLs
        const slugUrls = publishedClusters.slice(0, 20).map((c: any) => c.liveUrl);

        for (const cluster of publishedClusters.slice(0, 20)) {
          try {
            const rows = await sc.searchanalytics.query({
              siteUrl,
              requestBody: {
                startDate: new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10),
                endDate: now.toISOString().slice(0, 10),
                dimensions: ['page'],
                dimensionFilterGroups: [{
                  filters: [{ dimension: 'page', operator: 'equals', expression: cluster.liveUrl }]
                }],
              },
            });

            const row = rows.data.rows?.[0];
            if (row) {
              const impressions = row.impressions ?? 0;
              const clicks = row.clicks ?? 0;
              const avgPosition = row.position ?? 0;
              const ctr = impressions > 0 ? clicks / impressions : 0;

              // Compute trend vs previous period
              const prev = cluster.pageMetrics;
              let trend: 'rising' | 'stable' | 'falling' | 'unknown' = 'unknown';
              if (prev?.impressions != null) {
                const delta = impressions - prev.impressions;
                trend = delta > prev.impressions * 0.15 ? 'rising'
                      : delta < -prev.impressions * 0.15 ? 'falling'
                      : 'stable';
              }

              cluster.pageMetrics = { impressions, clicks, avgPosition, indexed: impressions > 0, trend, ctr, lastChecked: now };
              synced++;
            }
          } catch { /* individual page error — skip */ }
        }

        void slugUrls; // suppress unused warning
      } catch (gscErr: any) {
        console.warn(`[SYNC METRICS] GSC error for ${tenantId}: ${gscErr.message}`);
      }
    }

    // ── DataForSEO Rank Tracker fallback ─────────────────────────────────────
    if (synced === 0) {
      const login = client.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
      const pwd   = client.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;

      if (login && pwd) {
        const authString = Buffer.from(`${login}:${pwd}`).toString('base64');
        try {
          const postData = publishedClusters.slice(0, 10).map((c: any) => ({
            keyword: c.keyword,
            location_code: 2840,
            language_code: 'en',
          }));

          const res = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
            method: 'POST',
            headers: { Authorization: `Basic ${authString}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(postData),
          });
          const data = await res.json();

          if (data.status_code === 20000) {
            data.tasks?.forEach((task: any, i: number) => {
              const cluster = publishedClusters[i];
              if (!cluster) return;
              const items = task.result?.[0]?.items || [];
              const our = items.find((item: any) => item.url?.includes(client.targetDomain?.replace(/^https?:\/\//, '') || ''));
              const position = our?.rank_absolute ?? 100;

              const prev = cluster.pageMetrics;
              const prevPos = prev?.avgPosition ?? 100;
              const trend: 'rising' | 'stable' | 'falling' | 'unknown' =
                position < prevPos - 3 ? 'rising'
                : position > prevPos + 3 ? 'falling'
                : 'stable';

              cluster.pageMetrics = {
                impressions: prev?.impressions ?? 0,
                clicks: prev?.clicks ?? 0,
                avgPosition: position,
                indexed: position < 100,
                trend,
                ctr: prev?.ctr ?? 0,
                lastChecked: now,
              };
              synced++;
            });
          }
        } catch (dfsErr: any) {
          console.warn(`[SYNC METRICS] DFS fallback error: ${dfsErr.message}`);
        }
      }
    }

    await client.save();
    return NextResponse.json({ success: true, synced, total: publishedClusters.length });
  } catch (err: any) {
    console.error('[SYNC PAGE METRICS ERROR]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

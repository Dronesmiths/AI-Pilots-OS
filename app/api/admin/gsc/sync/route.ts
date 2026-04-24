/**
 * POST /api/admin/gsc/sync
 *
 * GSC Repair Bay Sync — Phase 2
 *
 * For each published cluster:
 *   1. Refreshes the Google access token using the stored refresh token
 *   2. Calls the GSC URL Inspection API to get real indexing status
 *   3. Calls Search Analytics API for impressions, clicks, avgPosition, CTR
 *   4. Writes results back to pageMetrics + sets repairStatus based on issues found
 *
 * Body: { tenantId: string }
 * Returns: { synced: number, errors: number, issues: Array<{keyword, slug, issue}> }
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

/** Refresh the Google access token using the stored refresh token */
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

/** Call GSC URL Inspection API for a single URL */
async function inspectUrl(
  accessToken: string,
  siteUrl: string,
  inspectionUrl: string
): Promise<{ indexed: boolean; crawlError: boolean; verdict: string; lastCrawled?: string }> {
  try {
    const res = await fetch(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inspectionUrl, siteUrl }),
      }
    );
    const data = await res.json();
    const result = data.inspectionResult?.indexStatusResult;
    const verdict = result?.verdict || 'UNKNOWN';
    return {
      indexed:     verdict === 'PASS',
      crawlError:  verdict === 'FAIL',
      verdict,
      lastCrawled: result?.lastCrawlTime,
    };
  } catch {
    return { indexed: false, crawlError: false, verdict: 'UNKNOWN' };
  }
}

/** Call GSC Search Analytics for a single URL (last 28 days) */
async function getAnalytics(
  accessToken: string,
  siteProperty: string,
  pageUrl: string
): Promise<{ impressions: number; clicks: number; avgPosition: number; ctr: number }> {
  const endDate   = new Date();
  const startDate = new Date(Date.now() - 28 * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  try {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteProperty)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate:   fmt(endDate),
          dimensions: ['page'],
          dimensionFilterGroups: [{
            filters: [{ dimension: 'page', operator: 'equals', expression: pageUrl }]
          }],
          rowLimit: 1,
        }),
      }
    );
    const data = await res.json();
    const row  = data.rows?.[0];
    if (!row) return { impressions: 0, clicks: 0, avgPosition: 0, ctr: 0 };
    return {
      impressions: row.impressions || 0,
      clicks:      row.clicks      || 0,
      avgPosition: row.position    || 0,
      ctr:         row.ctr         || 0,
    };
  } catch {
    return { impressions: 0, clicks: 0, avgPosition: 0, ctr: 0 };
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

    const client = await User.findById(tenantId)
      .select('seoClusters googleRefreshToken gscSiteProperty targetDomain')
      .lean() as any;

    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    if (!client.googleRefreshToken) {
      return NextResponse.json({
        error: 'GSC not connected. Use the Connect Search Console button in Repair Bay.',
        needsAuth: true,
      }, { status: 401 });
    }

    // Refresh access token
    const accessToken  = await refreshAccessToken(client.googleRefreshToken);
    const siteProperty = client.gscSiteProperty || `https://${client.targetDomain}/`;
    const baseUrl      = (client.targetDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

    const published = (client.seoClusters || []).filter(
      (c: any) => ['published', 'Live', 'completed'].includes(c.status) && (c.slug || c.keyword)
    );

    let synced = 0;
    let errors = 0;
    const issues: Array<{ keyword: string; slug: string; issue: string }> = [];
    const bulkOps: any[] = [];

    for (const cluster of published) {
      const slug       = cluster.slug || cluster.keyword.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const pageUrl    = `https://${baseUrl}/${slug}`;
      const clusterId  = (cluster._id || cluster.clusterId)?.toString();

      try {
        // Run inspection + analytics in parallel
        const [inspection, analytics] = await Promise.all([
          inspectUrl(accessToken, siteProperty, pageUrl),
          getAnalytics(accessToken, siteProperty, pageUrl),
        ]);

        const trend: 'rising' | 'stable' | 'falling' | 'unknown' =
          analytics.impressions > 50 ? 'rising' :
          analytics.impressions > 10 ? 'stable'  :
          analytics.impressions === 0 ? 'unknown' : 'falling';

        // Determine repair status
        let repairStatus: 'healthy' | 'needs_fix' = 'healthy';
        let issue = '';
        if (inspection.crawlError)      { repairStatus = 'needs_fix'; issue = 'crawl_error'; }
        else if (!inspection.indexed)   { repairStatus = 'needs_fix'; issue = 'not_indexed'; }
        else if (analytics.ctr < 0.01 && analytics.impressions > 20) {
          repairStatus = 'needs_fix'; issue = 'low_ctr';
        }

        if (issue) issues.push({ keyword: cluster.keyword, slug, issue });

        bulkOps.push({
          updateOne: {
            filter: { _id: tenantId, 'seoClusters._id': clusterId },
            update: {
              $set: {
                'seoClusters.$.pageMetrics': {
                  impressions:  analytics.impressions,
                  clicks:       analytics.clicks,
                  avgPosition:  analytics.avgPosition,
                  indexed:      inspection.indexed,
                  trend,
                  ctr:          analytics.ctr,
                  lastChecked:  new Date(),
                  verdict:      inspection.verdict,
                },
                'seoClusters.$.repairStatus': repairStatus,
                'seoClusters.$.liveUrl':      pageUrl,
              },
            },
          },
        });

        synced++;
        // Rate limit: GSC URL Inspection API has a 2000 req/day cap
        await new Promise(r => setTimeout(r, 300));
      } catch {
        errors++;
      }
    }

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }

    return NextResponse.json({
      synced,
      errors,
      issues,
      message: `Synced ${synced} pages. ${issues.length} issues found.`,
    });

  } catch (err: any) {
    console.error('[gsc/sync]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

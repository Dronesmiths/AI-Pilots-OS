/**
 * POST /api/admin/seo/repair-phase
 *
 * Runs a single repair phase on demand for a tenant.
 * Enables the War Room card to trigger each repair type independently
 * without waiting for the full 24h autonomous sweep.
 *
 * Body: { tenantId: string, phase: 'links' | 'images' | 'gsc' }
 *
 * Phase routing:
 *   links  → runs the same logic as /api/admin/seo/fix-links (token overlap linker)
 *   images → scans then flags broken images via /api/admin/seo/scan-images
 *   gsc    → re-submits pages with repairStatus:'needs_fix' for crawl / meta rewrite
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'in', 'of', 'to', 'with',
  'is', 'are', 'was', 'be', 'on', 'at', 'by', 'it', 'do', 'how',
  'can', 'i', 'your', 'my', 'we', 'you', 'near', 'best', 'top',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function toSlug(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

// ─── Phase 1: Internal Links ──────────────────────────────────────────────────
async function runLinksPhase(client: any, tenantId: string): Promise<{ message: string; linked: number }> {
  const published = (client.seoClusters || []).filter(
    (c: any) => ['published', 'Live', 'completed'].includes(c.status) && c.keyword
  );

  if (published.length < 2) {
    return { linked: 0, message: 'Not enough published pages to cross-link.' };
  }

  const pageMeta = published.map((c: any) => ({
    clusterId: (c._id || c.clusterId)?.toString(),
    keyword:   c.keyword,
    slug:      c.slug || toSlug(c.keyword),
    tokens:    tokenize(c.keyword + ' ' + (c.location || '') + ' ' + (c.category || '')),
  }));

  const baseUrl = (client.siteUrl || '').replace(/\/$/, '');
  const bulkOps: any[] = [];
  let linked = 0;

  for (const page of pageMeta) {
    const candidates = pageMeta
      .filter(p => p.clusterId !== page.clusterId)
      .map(p => ({ ...p, score: overlapScore(page.tokens, p.tokens) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (candidates.length === 0) continue;

    const linksPayload = JSON.stringify(
      candidates.map(p => ({ text: p.keyword, href: `${baseUrl}/${p.slug}`, slug: p.slug, score: p.score }))
    );

    bulkOps.push({
      updateOne: {
        filter: { _id: tenantId, 'seoClusters._id': page.clusterId },
        update: {
          $set: {
            'seoClusters.$.internalLinksPayload':      linksPayload,
            'seoClusters.$.internalLinksPreGenerated': true,
            'seoClusters.$.githubSyncRequired':         true,
            'seoClusters.$.repairStatus':               'repairing',
          },
        },
      },
    });
    linked++;
  }

  if (bulkOps.length > 0) await User.bulkWrite(bulkOps);
  return { linked, message: `${linked} pages queued for re-publish with internal links.` };
}

// ─── Phase 2: Broken Images ───────────────────────────────────────────────────
function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const srcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = srcRegex.exec(html)) !== null) {
    let src = match[1].trim();
    if (!src || src.startsWith('data:')) continue;
    if (src.startsWith('//'))    src = `https:${src}`;
    else if (src.startsWith('/')) src = `${baseUrl}${src}`;
    else if (!src.startsWith('http')) src = `${baseUrl}/${src}`;
    urls.push(src);
  }
  return [...new Set(urls)];
}

async function checkImageUrl(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Nova Repair Bot)' } });
    return res.ok;
  } catch { return false; }
  finally { clearTimeout(t); }
}

async function runImagesPhase(client: any, tenantId: string): Promise<{ message: string; scanned: number; broken: number }> {
  const rawDomain = (client.targetDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const baseUrl   = rawDomain ? `https://${rawDomain}` : '';

  const published = (client.seoClusters || []).filter(
    (c: any) => ['published', 'Live', 'completed'].includes(c.status) && c.htmlContent?.includes('<img')
  );

  if (published.length === 0) return { scanned: 0, broken: 0, message: 'No published pages with images found.' };

  let scanned = 0, totalBroken = 0;
  const bulkOps: any[] = [];

  for (const cluster of published) {
    const clusterId = (cluster._id || cluster.clusterId)?.toString();
    const imgUrls   = extractImageUrls(cluster.htmlContent, baseUrl);
    if (imgUrls.length === 0) continue;

    const brokenUrls: string[] = [];
    for (let i = 0; i < imgUrls.length; i += 6) {
      const batch   = imgUrls.slice(i, i + 6);
      const results = await Promise.all(batch.map(async url => ({ url, ok: await checkImageUrl(url) })));
      for (const r of results) if (!r.ok) brokenUrls.push(r.url);
    }

    scanned++;
    totalBroken += brokenUrls.length;
    const imgStatus = brokenUrls.length > 0 ? 'broken' : 'healthy';

    bulkOps.push({
      updateOne: {
        filter: { _id: tenantId, 'seoClusters._id': clusterId },
        update: {
          $set: {
            'seoClusters.$.imageHealth': { total: imgUrls.length, broken: brokenUrls.length, brokenUrls, lastScanned: new Date(), status: imgStatus },
            ...(brokenUrls.length > 0 && { 'seoClusters.$.repairStatus': 'needs_fix' }),
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) await User.bulkWrite(bulkOps);

  const pagesWithBroken = bulkOps.filter(op => op.updateOne.update.$set['seoClusters.$.repairStatus']).length;
  return {
    scanned,
    broken: pagesWithBroken,
    message: pagesWithBroken > 0
      ? `Scanned ${scanned} pages — ${pagesWithBroken} pages have broken images.`
      : `Scanned ${scanned} pages — all images healthy ✅`,
  };
}

// ─── Phase 3: GSC / Indexing ──────────────────────────────────────────────────
async function runGscPhase(client: any, tenantId: string): Promise<{ message: string; resolved: number }> {
  const needsFix = (client.seoClusters || []).filter(
    (c: any) =>
      ['published', 'Live', 'completed'].includes(c.status) &&
      (c.repairStatus === 'needs_fix' || c.pageMetrics?.indexed === false)
  );

  if (needsFix.length === 0) return { resolved: 0, message: 'No GSC repair issues found ✅' };

  const bulkOps: any[] = [];

  for (const cluster of needsFix) {
    const clusterId = (cluster._id || cluster.clusterId)?.toString();
    const issue     = cluster.repairIssue || (cluster.pageMetrics?.indexed === false ? 'not_indexed' : 'unknown');

    let updates: any = {};

    if (issue === 'not_indexed' || issue === 'unknown') {
      // Re-push triggers a fresh crawl signal
      updates = { 'seoClusters.$.githubSyncRequired': true, 'seoClusters.$.repairStatus': 'repairing' };
    } else if (issue === 'crawl_error' && cluster.htmlContent) {
      // Strip noindex/nofollow tags
      const fixed = cluster.htmlContent
        .replace(/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']\s*\/?>/gi, '')
        .replace(/<meta\s+content=["'][^"']*noindex[^"']*["']\s+name=["']robots["']\s*\/?>/gi, '');
      if (fixed !== cluster.htmlContent) {
        updates = { 'seoClusters.$.htmlContent': fixed, 'seoClusters.$.githubSyncRequired': true, 'seoClusters.$.repairStatus': 'repairing' };
      } else {
        updates = { 'seoClusters.$.repairStatus': 'healthy' };
      }
    } else {
      updates = { 'seoClusters.$.repairStatus': 'healthy' };
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: tenantId, 'seoClusters._id': clusterId },
        update:  { $set: updates },
      },
    });
  }

  if (bulkOps.length > 0) await User.bulkWrite(bulkOps);
  return { resolved: bulkOps.length, message: `${bulkOps.length} GSC issue(s) queued for re-crawl.` };
}

// ─── Router ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { tenantId, phase } = await req.json();

    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });
    if (!['links', 'images', 'gsc'].includes(phase)) {
      return NextResponse.json({ error: 'phase must be one of: links, images, gsc' }, { status: 400 });
    }

    const client = await User.findById(tenantId)
      .select('seoClusters siteUrl targetDomain')
      .lean() as any;

    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    let result: any;
    if (phase === 'links')  result = await runLinksPhase(client, tenantId);
    if (phase === 'images') result = await runImagesPhase(client, tenantId);
    if (phase === 'gsc')    result = await runGscPhase(client, tenantId);

    // Log a heartbeat so the War Room sees the drone as active
    try {
      await mongoose.connection.db!.collection('activityLogs').insertOne({
        userId:    tenantId,
        type:      'REPAIR_SWEEP_COMPLETE',
        message:   `🔧 Repair phase [${phase}] complete — ${result?.message ?? ''}`,
        metadata:  { phase, ...result },
        timestamp: new Date(),
      });
    } catch { /* heartbeat is best-effort, never fail the response */ }

    return NextResponse.json({ success: true, phase, ...result });

  } catch (err: any) {
    console.error('[repair-phase]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

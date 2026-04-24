/**
 * POST /api/admin/seo/scan-images
 *
 * Image Health Scanner — Repair Bay
 *
 * For each published cluster with stored htmlContent:
 *   1. Parses all <img src="..."> tags from the HTML
 *   2. HEAD-requests each image URL (timeout 8s)
 *   3. Flags 4xx/5xx responses or network failures as broken
 *   4. Stores result in cluster.imageHealth
 *   5. Tags clusters with broken images as repairStatus: 'needs_fix'
 *
 * Returns: { scanned, broken, totalImages, issues }
 *
 * Design note: uses HEAD requests not GET — no image data downloaded,
 * just checking status codes. Much faster and light on bandwidth.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

/** Extract all image URLs from raw HTML */
function extractImageUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];

  // Match <img src="..."> and <img src='...'>
  const srcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = srcRegex.exec(html)) !== null) {
    let src = match[1].trim();
    if (!src || src.startsWith('data:')) continue; // skip data URIs

    // Resolve relative URLs
    if (src.startsWith('//')) {
      src = `https:${src}`;
    } else if (src.startsWith('/')) {
      src = `${baseUrl}${src}`;
    } else if (!src.startsWith('http')) {
      src = `${baseUrl}/${src}`;
    }

    urls.push(src);
  }

  // Also match CSS background images (url("..."))
  const bgRegex = /url\(["']?([^"')]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    let src = match[1].trim();
    if (!src || src.startsWith('data:')) continue;
    if (src.startsWith('/')) src = `${baseUrl}${src}`;
    if (src.startsWith('http')) urls.push(src);
  }

  return [...new Set(urls)]; // deduplicate
}

/** HEAD-check a single URL — returns true if the image is alive */
async function checkImageUrl(url: string): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Nova Repair Bot)' },
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 }; // network error / timeout
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

    const client = await User.findById(tenantId)
      .select('seoClusters targetDomain')
      .lean() as any;

    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const rawDomain = (client.targetDomain || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const baseUrl   = rawDomain ? `https://${rawDomain}` : '';

    const published = (client.seoClusters || []).filter(
      (c: any) =>
        ['published', 'Live', 'completed'].includes(c.status) &&
        c.htmlContent &&
        c.htmlContent.includes('<img')
    );

    if (published.length === 0) {
      return NextResponse.json({
        scanned: 0, broken: 0, totalImages: 0,
        message: 'No published pages with images found.',
      });
    }

    let scanned     = 0;
    let totalBroken = 0;
    let totalImages = 0;
    const issues: Array<{ keyword: string; slug: string; brokenUrls: string[] }> = [];
    const bulkOps: any[] = [];

    for (const cluster of published) {
      const clusterId = (cluster._id || cluster.clusterId)?.toString();
      const slug      = cluster.slug || '';
      const imgUrls   = extractImageUrls(cluster.htmlContent, baseUrl);

      if (imgUrls.length === 0) continue;

      // Check all images in parallel (cap at 6 concurrent)
      const CONCURRENCY = 6;
      const brokenUrls: string[] = [];

      for (let i = 0; i < imgUrls.length; i += CONCURRENCY) {
        const batch = imgUrls.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async url => ({ url, ...(await checkImageUrl(url)) }))
        );
        for (const r of results) {
          if (!r.ok) brokenUrls.push(r.url);
        }
      }

      totalImages += imgUrls.length;
      totalBroken += brokenUrls.length;
      scanned++;

      const imgStatus: 'healthy' | 'broken' | 'unscanned' =
        brokenUrls.length > 0 ? 'broken' : 'healthy';

      if (brokenUrls.length > 0) {
        issues.push({ keyword: cluster.keyword, slug, brokenUrls });
      }

      bulkOps.push({
        updateOne: {
          filter: { _id: tenantId, 'seoClusters._id': clusterId },
          update: {
            $set: {
              'seoClusters.$.imageHealth': {
                total:       imgUrls.length,
                broken:      brokenUrls.length,
                brokenUrls,
                lastScanned: new Date(),
                status:      imgStatus,
              },
              // Only flag repairStatus if there are broken images
              ...(brokenUrls.length > 0 && { 'seoClusters.$.repairStatus': 'needs_fix' }),
            },
          },
        },
      });
    }

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }

    const pagesWithBroken = issues.length;

    return NextResponse.json({
      scanned,
      broken:     pagesWithBroken,
      totalImages,
      issues,
      message: pagesWithBroken > 0
        ? `Scanned ${scanned} pages — ${pagesWithBroken} pages have broken images (${totalBroken} total broken).`
        : `Scanned ${scanned} pages — all ${totalImages} images are healthy ✅`,
    });

  } catch (err: any) {
    console.error('[scan-images]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

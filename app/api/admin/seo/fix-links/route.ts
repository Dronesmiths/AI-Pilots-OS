/**
 * POST /api/admin/seo/fix-links
 *
 * Internal Link Engine — Phase 1 Repair Bay
 *
 * For every published cluster belonging to a tenant:
 *   1. Tokenises the keyword into meaningful terms
 *   2. Scores all OTHER published pages by token overlap
 *   3. Selects the top 3–5 most related pages as outbound links
 *   4. Writes internalLinksPayload + sets githubSyncRequired = true
 *      so the github-sync drone re-pushes updated HTML on its next sweep
 *
 * Returns { linked: number, skipped: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

// Words not worth matching on
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'in', 'of', 'to', 'with',
  'is', 'are', 'was', 'be', 'on', 'at', 'by', 'it', 'do', 'how',
  'can', 'i', 'your', 'my', 'we', 'you', 'near', 'best', 'top',
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t))
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const t of a) if (b.has(t)) count++;
  return count;
}

/** Generates a clean slug from keyword if one isn't stored */
function toSlug(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();

    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

    const client = await User.findById(tenantId).select('seoClusters siteUrl').lean() as any;
    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const baseUrl = (client.siteUrl || '').replace(/\/$/, '');

    // Only work with published pages that have a keyword
    const published = (client.seoClusters || []).filter(
      (c: any) => ['published', 'Live', 'completed'].includes(c.status) && c.keyword
    );

    if (published.length < 2) {
      return NextResponse.json({ linked: 0, skipped: 0, message: 'Not enough published pages to cross-link' });
    }

    // Build token sets for each page once
    const pageMeta = published.map((c: any) => ({
      clusterId: (c._id || c.clusterId)?.toString(),
      keyword:   c.keyword,
      slug:      c.slug || toSlug(c.keyword),
      tokens:    tokenize(c.keyword + ' ' + (c.location || '') + ' ' + (c.category || '')),
    }));

    let linked = 0;
    let skipped = 0;

    // For each page, find the best related pages
    const bulkOps: any[] = [];

    for (const page of pageMeta) {
      // Score all other pages
      const scored = pageMeta
        .filter(p => p.clusterId !== page.clusterId)
        .map(p => ({ ...p, score: overlapScore(page.tokens, p.tokens) }))
        .filter(p => p.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // top 5 related pages

      if (scored.length === 0) {
        skipped++;
        continue;
      }

      // Build structured link payload
      const linksPayload = JSON.stringify(
        scored.map(p => ({
          text: p.keyword,
          href: `${baseUrl}/${p.slug}`,
          slug: p.slug,
          score: p.score,
        }))
      );

      bulkOps.push({
        updateOne: {
          filter: {
            _id: tenantId,
            'seoClusters._id': page.clusterId,
          },
          update: {
            $set: {
              'seoClusters.$.internalLinksPayload':     linksPayload,
              'seoClusters.$.internalLinksPreGenerated': true,
              'seoClusters.$.githubSyncRequired':        true,
              'seoClusters.$.repairStatus':              'repairing',
            },
          },
        },
      });

      linked++;
    }

    if (bulkOps.length > 0) {
      await User.bulkWrite(bulkOps);
    }

    return NextResponse.json({
      linked,
      skipped,
      total: published.length,
      message: `${linked} pages queued for internal link re-publish. The GitHub sync drone will push them automatically.`,
    });

  } catch (err: any) {
    console.error('[fix-links]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

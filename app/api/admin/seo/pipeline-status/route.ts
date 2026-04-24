import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import mongoose from 'mongoose';

/** Convert a keyword string to a URL slug */
function toSlug(str: string): string {
  return str
    .toLowerCase()
    .replace(/['''\u2018\u2019]/g, '')       // smart quotes
    .replace(/[^a-z0-9\s-]/g, ' ')           // strip special chars
    .trim()
    .replace(/\s+/g, '-')                    // spaces → dashes
    .replace(/-+/g, '-')                     // collapse dashes
    .slice(0, 100);                          // max 100 chars
}

/** Determine URL path prefix from category */
function pathPrefix(category: string): string {
  if (category === 'blog' || category === 'paa') return '/blog/';
  if (category === 'qa')                         return '/qa/';
  return '/articles/';
}

/**
 * GET /api/admin/seo/pipeline-status?tenantId=xxx
 * Returns live page pipeline: queued → published — with clickable URLs.
 * Polled every 10s by the War Room Live Pipeline panel.
 */
export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const tenantId = req.nextUrl.searchParams.get('tenantId');
    if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });


    const db = mongoose.connection.db!;

    let tenantOid: any;
    try { tenantOid = new mongoose.Types.ObjectId(tenantId); }
    catch {
      // Not a valid ObjectId — try looking up by domain name
      const byDomain = await db.collection('users').findOne(
        { targetDomain: tenantId },
        { projection: { _id: 1 } }
      );
      if (!byDomain) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
      tenantOid = byDomain._id;
    }

    const [client] = await db.collection('users').aggregate([
      { $match: { _id: tenantOid } },
      { $project: {
        targetDomain: 1,
        githubOwner: 1,
        githubRepo: 1,
        seoClusters: {
          $map: {
            input: { $ifNull: ['$seoClusters', []] },
            as: 'c',
            in: {
              _id:              '$$c._id',
              keyword:          '$$c.keyword',
              target:           '$$c.target',
              slug:             '$$c.slug',
              category:         '$$c.category',
              status:           '$$c.status',
              role:             '$$c.role',
              scheduledTime:    '$$c.scheduledTime',
              pushedAt:         '$$c.pushedAt',
              createdAt:        '$$c.createdAt',
              updatedAt:        '$$c.updatedAt',
              liveUrl:          '$$c.liveUrl',
              pageScore:        '$$c.pageScore',
              performanceStatus:'$$c.performanceStatus',
              isWinner:         '$$c.isWinner',
            }
          }
        }
      }}
    ], { maxTimeMS: 15000 }).toArray();
    if (!client) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const clusters: any[] = client.seoClusters || [];
    const domain = (client.targetDomain || '').replace(/\/+$/, '');
    const domainRoot = domain ? `https://${domain.replace(/^https?:\/\//, '')}` : '';

    // Build a URL for a cluster — use stored liveUrl first, construct from keyword as fallback
    const buildUrl = (c: any): string | null => {
      if (c.liveUrl) return c.liveUrl;
      if (!domainRoot) return null;
      const slug = c.slug || toSlug(c.keyword || c.target || '');
      if (!slug) return null;
      return `${domainRoot}${pathPrefix(c.category || 'service')}${slug}/`;
    };

    // Exclude competitor-tracking entries (they're competitive intel, not pages we publish)
    const contentClusters = clusters.filter(c =>
      !['competitor', 'backlink'].includes(c.category || '')
    );

    // ── Queued: all pending manual targets (draft, queued, idle) ────────────
    const queued = contentClusters
      .filter(c => ['draft', 'queued', 'idle'].includes(c.status))
      .sort((a, b) => new Date(a.scheduledTime || a.createdAt || 0).getTime() - new Date(b.scheduledTime || b.createdAt || 0).getTime())
      .slice(0, 500)
      .map(c => ({
        keyword: c.keyword || c.target,
        slug:    c.slug || null,
        scheduledTime: c.scheduledTime,
        role:    c.role || 'supporting',
        category: c.category || 'service',
        createdAt: c.createdAt || c.updatedAt,
      }));

    // ── Published: live pages with reconstructed URLs ───────────────────────
    const published = contentClusters
      .filter(c => ['published', 'Live'].includes(c.status))
      .sort((a, b) => new Date(b.pushedAt || 0).getTime() - new Date(a.pushedAt || 0).getTime())
      .slice(0, 50)
      .map(c => ({
        keyword:           c.keyword || c.target,
        slug:              c.slug || null,
        liveUrl:           buildUrl(c),
        pushedAt:          c.pushedAt || null,
        pageScore:         c.pageScore ?? null,
        performanceStatus: c.performanceStatus || null,
        isWinner:          c.isWinner || false,
        category:          c.category || 'service',
      }));

    // ── Unscheduled drafts ──────────────────────────────────────────────────
    const pending = contentClusters
      .filter(c => c.status === 'draft' && !c.scheduledTime)
      .slice(0, 10)
      .map(c => ({
        keyword:  c.keyword || c.target,
        slug:     c.slug || null,
        role:     c.role || 'supporting',
        category: c.category || 'service',
      }));

    return NextResponse.json({
      queued,
      published,
      pending,
      domain: domainRoot,
      totalQueued:    queued.length,
      totalPublished: published.length,
      totalPending:   pending.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

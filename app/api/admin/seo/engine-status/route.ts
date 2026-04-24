/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/engine-status/route.ts
 *
 * Derived Intelligence Layer — real aggregated engine state.
 * NO raw cluster documents sent to UI.
 * ALL values computed server-side from MongoDB aggregation.
 *
 * ?userId=<id>  → single-client view
 * (no param)    → all users aggregated (admin global view)
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User              from '@/models/User';
import { Types }         from 'mongoose';

export const dynamic = 'force-dynamic';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

/** Returns the updatedAt of the oldest cluster in a given status, or null */
function getOldest(clusters: any[], status: string): string | null {
  const items = clusters
    .filter(c => (c.status ?? '').toLowerCase() === status.toLowerCase())
    .sort((a, b) => new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime());
  return items[0]?.updatedAt ?? null;
}

export async function GET(req: Request) {
  try {
    // Auth
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // ── Build aggregation pipeline ───────────────────────────────────────────
    const matchStage: any = {};
    if (userId) {
      if (!Types.ObjectId.isValid(userId)) {
        return NextResponse.json({ error: 'Invalid userId' }, { status: 400 });
      }
      matchStage._id = new Types.ObjectId(userId);
    }

    const clusters: any[] = await User.aggregate([
      { $match: matchStage },
      { $unwind: '$seoClusters' },
      {
        $project: {
          _id: 0,
          keyword:     '$seoClusters.keyword',
          status:      '$seoClusters.status',
          // stuckCycles lives at seoClusters.airs.stuckCycles
          stuckCycles: { $ifNull: ['$seoClusters.airs.stuckCycles', '$seoClusters.stuckCycles', 0] },
          publishedAt: '$seoClusters.publishMeta.publishedAt',
          liveUrl:     '$seoClusters.liveUrl',
          updatedAt:   '$seoClusters.updatedAt',
        }
      }
    ]);

    // ── Pipeline counts ───────────────────────────────────────────────────────
    const pipeline = {
      idea: 0, queued: 0, processing: 0,
      built: 0, enhanced: 0, QA: 0, published: 0,
    };
    for (const c of clusters) {
      const s = (c.status ?? '').toLowerCase();
      if (s in pipeline) (pipeline as any)[s]++;
      // normalise "live" → published
      else if (s === 'live') pipeline.published++;
    }

    // ── AIRS health ───────────────────────────────────────────────────────────
    const stuck3     = clusters.filter(c => (c.stuckCycles ?? 0) >= 3).length;
    const stuck6     = clusters.filter(c => (c.stuckCycles ?? 0) >= 6).length;
    const stuck10Plus= clusters.filter(c => (c.stuckCycles ?? 0) >= 10).length;
    const stuckCount = stuck3;

    // ── Battle score ──────────────────────────────────────────────────────────
    const totalKeywords    = clusters.length;
    const livePages        = pipeline.published;
    const inPipeline       = totalKeywords - livePages;
    const needingAttention = stuckCount;

    // ── Engine mode ───────────────────────────────────────────────────────────
    let mode: 'expansion' | 'reinforcement' | 'balanced' = 'balanced';
    if (pipeline.idea + pipeline.queued > livePages * 0.5) mode = 'expansion';
    else if (stuck6 > 0)                                   mode = 'reinforcement';

    // ── Focus keyword (most recently active cluster) ──────────────────────────
    const focusCluster = clusters
      .filter(c => ['processing', 'built', 'queued'].includes((c.status ?? '').toLowerCase()))
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())[0];

    // ── Last publish ──────────────────────────────────────────────────────────
    const lastPublishCluster = clusters
      .filter(c => ['published', 'live'].includes((c.status ?? '').toLowerCase()) && c.publishedAt)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())[0];

    // ── Recent actions (derived from real updatedAt — no guessing) ──────────
    const recentActions = [...clusters]
      .sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime())
      .slice(0, 10)
      .map(c => ({
        type:      (c.status ?? 'unknown').toLowerCase(),
        message:   `${(c.status ?? 'UNKNOWN').toUpperCase()} → ${c.keyword ?? 'Untitled'}`,
        createdAt: c.updatedAt ?? null,
      }));

    // ── AIRS breakdown ────────────────────────────────────────────────
    const airsHealthy = clusters.filter(c => (c.stuckCycles ?? 0) === 0).length;
    const airsWatch   = clusters.filter(c => { const sc = c.stuckCycles ?? 0; return sc >= 3 && sc < 6; }).length;
    const airsAction  = stuck6;

    // ── Pipeline oldest timestamps (bottleneck visibility) ───────────────
    const pipelineMeta = {
      oldest: {
        queued:     getOldest(clusters, 'queued'),
        processing: getOldest(clusters, 'processing'),
        QA:         getOldest(clusters, 'QA'),
      },
    };

    return NextResponse.json({
      ok: true,
      data: {
        mode,
        focusKeyword: focusCluster?.keyword ?? null,

        pipeline,

        pipelineMeta,

        health: { stuckCount, stuck3, stuck6, stuck10Plus },

        airs: {
          healthy: airsHealthy,
          watch:   airsWatch,
          action:  airsAction,
          stuck3, stuck6, stuck10Plus,
          total:   clusters.length,
        },

        battle: { totalKeywords, livePages, inPipeline, needingAttention },

        recentActions,

        lastPublish: lastPublishCluster ? {
          keyword:     lastPublishCluster.keyword,
          liveUrl:     lastPublishCluster.liveUrl ?? null,
          publishedAt: lastPublishCluster.publishedAt ?? null,
        } : null,
      },
    });

  } catch (err: any) {
    console.error('[engine-status]', err.message);
    return NextResponse.json({ error: 'Failed to load engine status' }, { status: 500 });
  }
}

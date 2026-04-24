/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/leaderboard/route.ts
 *
 * GET /api/admin/seo/leaderboard
 *
 * Operational strength leaderboard — not traffic, not vanity metrics.
 * Answers: who is shipping, who is healthy, who is in trouble.
 *
 * strengthScore formula:
 *   published * 5  +  published7d * 8  +  healthyIndexed * 4
 *   + recentCompletedJobs * 3
 *   - stuck6 * 6  -  stuck10Plus * 10  -  failedJobs * 8
 *
 * Tiers: Elite (≥200) | Strong (≥120) | Growing (≥60) | Building (<60)
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User             from '@/models/User';
import SeoActionJob     from '@/models/SeoActionJob';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    if (decoded.role !== 'superadmin') throw new Error();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const users = await User.find(
      { 'seoClusters.0': { $exists: true } },
      { name: 1, domain: 1, email: 1, seoClusters: 1 }
    ).lean() as any[];

    const userIds = users.map(u => u._id);

    const jobs = await SeoActionJob.find({ userId: { $in: userIds } }).lean() as any[];

    const now = Date.now();
    const week = 7 * 24 * 60 * 60 * 1000;

    const rows = users.map(user => {
      const clusters: any[] = user.seoClusters ?? [];
      const userJobs: any[]  = jobs.filter(j => String(j.userId) === String(user._id));

      const published     = clusters.filter(c => ['published','live'].includes((c.status ?? '').toLowerCase())).length;
      const healthyIndexed= clusters.filter(c => (c?.airs?.stuckCycles ?? 0) === 0).length;
      const stuck6        = clusters.filter(c => (c?.airs?.stuckCycles ?? 0) >= 6).length;
      const stuck10Plus   = clusters.filter(c => (c?.airs?.stuckCycles ?? 0) >= 10).length;

      const published7d = clusters.filter(c => {
        const d = c.publishedAt ?? c.publishMeta?.publishedAt;
        return d && now - new Date(d).getTime() <= week;
      }).length;

      const recentCompletedJobs = userJobs.filter(j =>
        j.status === 'completed' && j.completedAt
        && now - new Date(j.completedAt).getTime() <= week
      ).length;

      const failedJobs = userJobs.filter(j => j.status === 'failed').length;

      const strengthScore =
        published            * 5  +
        published7d          * 8  +
        healthyIndexed       * 4  +
        recentCompletedJobs  * 3  -
        stuck6               * 6  -
        stuck10Plus          * 10 -
        failedJobs           * 8;

      let tier = 'Building';
      if      (strengthScore >= 200) tier = 'Elite';
      else if (strengthScore >= 120) tier = 'Strong';
      else if (strengthScore >=  60) tier = 'Growing';

      return {
        userId:   String(user._id),
        siteName: user.name ?? user.domain ?? user.email ?? 'Unknown',
        domain:   user.domain ?? null,
        strengthScore,
        tier,
        stats: {
          published, published7d, healthyIndexed,
          stuck6, stuck10Plus,
          recentCompletedJobs, failedJobs,
          total: clusters.length,
        },
      };
    });

    rows.sort((a, b) => b.strengthScore - a.strengthScore);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      rows,
    });

  } catch (err: any) {
    console.error('[leaderboard]', err.message);
    return NextResponse.json({ error: 'Failed to load leaderboard' }, { status: 500 });
  }
}

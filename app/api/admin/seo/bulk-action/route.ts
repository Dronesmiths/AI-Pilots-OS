/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/bulk-action/route.ts
 *
 * POST /api/admin/seo/bulk-action
 *
 * Queues real per-cluster jobs across multiple sites.
 * Uses the same dedupe logic as /api/admin/seo/action.
 *
 * Body:
 *   action:  'boost' | 'reinforce' | 'internal_links' | 'publish'
 *   mode:    'selected' | 'autopilot_top' | 'all_matching'
 *   userIds: string[]   (required for mode=selected)
 *   limit:   number     (how many top sites to target, default 5)
 *
 * Never fires per site — per cluster.
 * Autopilot mode uses the same shared scoring as the recommendation endpoint.
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import { Types }        from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import User             from '@/models/User';
import SeoActionJob     from '@/models/SeoActionJob';
import SeoActivityEvent from '@/models/SeoActivityEvent';
import { scoreAutopilotTargets } from '@/lib/seo/getAutopilotTargets';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

const ALLOWED_ACTIONS = new Set(['boost', 'reinforce', 'internal_links', 'publish']);

const PRIORITY_SCORE_MAP: Record<string, number> = {
  boost: 75, reinforce: 60, internal_links: 50, publish: 50,
};

const PRIORITY_MAP: Record<string, string> = {
  boost: 'high', reinforce: 'high', internal_links: 'normal', publish: 'normal',
};

export async function POST(req: Request) {
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

    const body = await req.json();
    const { action, userIds = [], mode = 'selected', limit = 5 } = body ?? {};

    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: `Invalid action. Allowed: ${[...ALLOWED_ACTIONS].join(', ')}` }, { status: 400 });
    }

    // ── Resolve target users ──────────────────────────────────────────────────
    let targetUsers: any[] = [];

    if (mode === 'selected') {
      const validIds = (userIds as string[]).filter(Types.ObjectId.isValid);
      if (!validIds.length) return NextResponse.json({ error: 'No valid userIds provided' }, { status: 400 });
      targetUsers = await User.find({ _id: { $in: validIds } })
        .select('name domain email seoClusters').lean() as any[];

    } else if (mode === 'autopilot_top') {
      // Use shared scoring — same ranking as recommendation endpoint
      const allUsers = await User.find({ 'seoClusters.0': { $exists: true } })
        .select('name domain email seoClusters').lean() as any[];
      const allJobs  = await SeoActionJob.find({
        userId: { $in: allUsers.map(u => u._id) },
        status: { $in: ['queued','processing','failed'] },
      }).lean() as any[];
      const jobsByUser = new Map<string, any[]>();
      for (const j of allJobs) {
        const key = String(j.userId);
        jobsByUser.set(key, [...(jobsByUser.get(key) ?? []), j]);
      }
      const ranked = scoreAutopilotTargets(allUsers, jobsByUser);
      const topIds = ranked.slice(0, limit).map(t => t.userId);
      targetUsers  = allUsers.filter(u => topIds.includes(String(u._id)));

    } else if (mode === 'all_matching') {
      targetUsers = await User.find({ 'seoClusters.0': { $exists: true } })
        .select('name domain email seoClusters').lean() as any[];
    }

    // ── Cluster filter per action ────────────────────────────────────────────
    function matchesCriteria(c: any): boolean {
      const stuckCycles = c?.airs?.stuckCycles ?? 0;
      const status      = (c.status ?? '').toLowerCase();
      if (action === 'boost')          return stuckCycles >= 6;
      if (action === 'reinforce')      return stuckCycles >= 3;
      if (action === 'internal_links') return ['published','live'].includes(status) && (c.internalLinksInjected ?? 0) < 3;
      if (action === 'publish')        return ['queued','qa','enhanced','built'].includes(status);
      return false;
    }

    // ── Queue jobs ────────────────────────────────────────────────────────────
    const createdJobs: any[]  = [];
    const dedupedJobs: any[]  = [];

    for (const user of targetUsers) {
      const candidates = (user.seoClusters ?? [])
        .filter(matchesCriteria)
        .slice(0, 10); // cap per-user to prevent queue flooding

      for (const cluster of candidates) {
        // Dedupe — same logic as single action route
        const existing = await SeoActionJob.findOne({
          userId: user._id,
          clusterId: cluster._id,
          action,
          status: { $in: ['queued', 'processing'] },
        }).lean();

        if (existing) {
          dedupedJobs.push({ userId: String(user._id), keyword: cluster.keyword });
          continue;
        }

        const job = await SeoActionJob.create({
          userId:        user._id,
          clusterId:     cluster._id,
          action,
          keyword:       cluster.keyword,
          liveUrl:       cluster.liveUrl ?? null,
          priority:      PRIORITY_MAP[action] ?? 'normal',
          priorityScore: PRIORITY_SCORE_MAP[action] ?? 50,
          source:        'dashboard',
          payload: {
            currentStatus: cluster.status,
            stuckCycles:   cluster?.airs?.stuckCycles ?? 0,
            bulkMode:      mode,
          },
        });

        await SeoActivityEvent.create({
          userId:    user._id,
          clusterId: cluster._id,
          jobId:     job._id,
          type:      'job_queued',
          severity:  'info',
          keyword:   cluster.keyword,
          message:   `[Bulk/${mode}] Queued ${action} for "${cluster.keyword}"`,
          meta:      { action, mode },
        });

        createdJobs.push({
          userId:  String(user._id),
          site:    user.name ?? user.domain ?? user.email,
          keyword: cluster.keyword,
          jobId:   String(job._id),
        });
      }
    }

    return NextResponse.json({
      ok:      true,
      created: createdJobs.length,
      deduped: dedupedJobs.length,
      jobs:    createdJobs,
    });

  } catch (err: any) {
    console.error('[bulk-action]', err.message);
    return NextResponse.json({ error: 'Failed to queue bulk action' }, { status: 500 });
  }
}

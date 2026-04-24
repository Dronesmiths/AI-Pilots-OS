/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/pages/route.ts
 *
 * GET /api/admin/seo/pages?userId=<id>
 *
 * Returns lightweight cluster records for the Page Table.
 * Only the fields needed for display — never returns htmlContent.
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import { Types }        from 'mongoose';
import connectToDatabase from '@/lib/mongodb';
import User             from '@/models/User';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

export async function GET(req: Request) {
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

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId || !Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: 'Valid userId required' }, { status: 400 });
    }

    const pages = await User.aggregate([
      { $match: { _id: new Types.ObjectId(userId) } },
      { $unwind: '$seoClusters' },
      {
        $project: {
          _id:         0,
          clusterId:   '$seoClusters._id',
          keyword:     '$seoClusters.keyword',
          status:      '$seoClusters.status',
          updatedAt:   '$seoClusters.updatedAt',
          publishedAt: { $ifNull: ['$seoClusters.publishedAt', '$seoClusters.publishMeta.publishedAt'] },
          liveUrl:     '$seoClusters.liveUrl',
          stuckCycles: { $ifNull: ['$seoClusters.airs.stuckCycles', '$seoClusters.stuckCycles', 0] },
          internalLinksInjected: { $ifNull: ['$seoClusters.internalLinksInjected', 0] },
          lastDroneAction: '$seoClusters.lastDroneAction',
          refinementsApplied: { $ifNull: ['$seoClusters.refinementsApplied', 0] },
        },
      },
      { $sort: { updatedAt: -1 } },
      { $limit: 200 },
    ]);

    return NextResponse.json({ ok: true, pages });

  } catch (err: any) {
    console.error('[seo/pages]', err.message);
    return NextResponse.json({ error: 'Failed to load pages' }, { status: 500 });
  }
}

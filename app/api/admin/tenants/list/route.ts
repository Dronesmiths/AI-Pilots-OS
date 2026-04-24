/**
 * GET /api/admin/tenants/list
 *
 * Internal drone endpoint — returns all tenants with:
 *   - SEO clusters enabled (has seoClusters data)
 *   - Their GSC connection status
 *
 * Protected by DRONE_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-drone-secret');
  if (process.env.DRONE_SECRET && secret !== process.env.DRONE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectToDatabase();

    const tenants = await User.find(
      { 'seoClusters.0': { $exists: true } }, // has at least one cluster
      {
        _id: 1,
        name: 1,
        targetDomain: 1,
        googleRefreshToken: 1,
        gscSiteProperty: 1,
        gscConnectedAt: 1,
      }
    ).lean();

    return NextResponse.json({
      tenants: tenants.map((t: any) => ({
        _id:                t._id.toString(),
        name:               t.name,
        targetDomain:       t.targetDomain,
        hasGsc:             !!(t.googleRefreshToken && t.gscSiteProperty),
        gscSiteProperty:    t.gscSiteProperty,
        googleRefreshToken: t.googleRefreshToken, // needed by drone
        gscConnectedAt:     t.gscConnectedAt,
      })),
      count: tenants.length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

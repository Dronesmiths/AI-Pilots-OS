/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/seo/jobs/[id]/explain/route.ts
 * GET → why-this-action data for one job (used by Approval Center row)
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import jwt              from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import SeoActionJob     from '@/models/SeoActionJob';

export const dynamic = 'force-dynamic';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';

export async function GET(_: Request, { params }: any) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const d = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    if (d.role !== 'superadmin') throw new Error();
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }

  await connectToDatabase();

  const job = await SeoActionJob.findById(params.id).lean() as any;
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    data: {
      id:              String(job._id),
      action:          job.action,
      keyword:         job.keyword,
      status:          job.status,
      approvalStatus:  job.approvalStatus,
      approvalReason:  job.approvalReason,
      recommendedBy:   job.recommendedBy,
      confidence:      job.payload?.confidence   ?? null,
      policyClass:     job.payload?.policyClass  ?? null,
      negativeRuns:    job.payload?.negativeRuns ?? 0,
      context:         job.payload?.context      ?? {},
      stuckCycles:     job.payload?.stuckCycles  ?? 0,
      currentStatus:   job.payload?.currentStatus ?? '',
      explanation:     job.payload?.explanation   ?? null,
      strategyType:    job.payload?.strategyType  ?? null,
      campaignId:      job.payload?.campaignId    ?? null,
    },
  });
}

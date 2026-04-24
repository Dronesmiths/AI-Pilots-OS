/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/onboarding/install/status/route.ts
 * GET ?clientId=&tenantId=&jobId=
 * → Returns current install job status + recent logs for polling
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import jwt                           from 'jsonwebtoken';
import connectToDatabase             from '@/lib/mongodb';
import InstallJob, { INSTALL_STEP_LABELS } from '@/models/onboarding/InstallJob';
import InstallJobLog                 from '@/models/onboarding/InstallJobLog';
import OnboardingSession             from '@/models/onboarding/OnboardingSession';

export const dynamic = 'force-dynamic';

async function requireAdmin(cs: any) {
  const token = cs.get('admin_token')?.value;
  if (!token) return false;
  try { jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-local-dev'); return true; }
  catch { return false; }
}

export async function GET(req: NextRequest) {
  const cs = await cookies();
  if (!await requireAdmin(cs)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = req.nextUrl.searchParams.get('clientId');
  const tenantId = req.nextUrl.searchParams.get('tenantId') ?? 'default';
  const jobId    = req.nextUrl.searchParams.get('jobId');
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  await connectToDatabase();

  // Find most recent job for this client if jobId not provided
  const job = jobId
    ? await InstallJob.findById(jobId).lean()
    : await InstallJob.findOne({ tenantId, clientId }).sort({ createdAt: -1 }).lean() as any;

  if (!job) return NextResponse.json({ ok: true, job: null, logs: [], session: null });

  // Fetch most recent 20 log entries
  const logs = await InstallJobLog.find({ installJobId: String((job as any)._id) })
    .sort({ createdAt: 1 })
    .limit(30)
    .lean() as any[];

  // Fetch session for overall status
  const session = await OnboardingSession.findOne({ tenantId, clientId }, { install: 1, postInstall: 1 }).lean();

  // Enrich logs with human step labels
  const enrichedLogs = logs.map(l => ({
    ...l,
    stepLabel: INSTALL_STEP_LABELS[l.step] ?? l.step,
  }));

  return NextResponse.json({
    ok:    true,
    job,
    logs:  enrichedLogs,
    session,
  });
}

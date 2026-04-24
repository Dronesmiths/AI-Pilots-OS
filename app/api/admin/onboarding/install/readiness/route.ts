/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/onboarding/install/readiness/route.ts
 * POST { clientId, tenantId? } → runs readiness evaluation
 *
 * app/api/admin/onboarding/install/run/route.ts
 * POST { clientId, tenantId?, initiatedBy? } → starts install job
 *
 * app/api/admin/onboarding/install/status/route.ts
 * GET ?clientId=&jobId= → polls install job status
 */
import { NextRequest, NextResponse }    from 'next/server';
import { cookies }                      from 'next/headers';
import jwt                              from 'jsonwebtoken';
import connectToDatabase               from '@/lib/mongodb';
import InstallJob                      from '@/models/onboarding/InstallJob';
import InstallJobLog                   from '@/models/onboarding/InstallJobLog';
import { evaluateInstallReadiness }    from '@/lib/onboarding/evaluateInstallReadiness';

export const dynamic = 'force-dynamic';

async function requireAdmin(cs: any) {
  const token = cs.get('admin_token')?.value;
  if (!token) return false;
  try { jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-local-dev'); return true; }
  catch { return false; }
}

export async function POST(req: NextRequest) {
  const cs = await cookies();
  if (!await requireAdmin(cs)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clientId, tenantId = 'default' } = await req.json();
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const readiness = await evaluateInstallReadiness(tenantId, clientId);
  return NextResponse.json({ ok: true, ...readiness });
}

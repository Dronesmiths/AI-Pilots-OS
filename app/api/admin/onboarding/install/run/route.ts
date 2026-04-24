/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/onboarding/install/run/route.ts
 * POST { clientId, tenantId?, initiatedBy? }
 * Kicks off runInstallFlow in background (non-blocking response).
 * Returns jobId immediately — client polls /install/status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import jwt                           from 'jsonwebtoken';
import { runInstallFlow }            from '@/lib/onboarding/runInstallFlow';

export const dynamic = 'force-dynamic';
// Allow up to 5 minutes for the install orchestrator
export const maxDuration = 300;

async function requireAdmin(cs: any) {
  const token = cs.get('admin_token')?.value;
  if (!token) return false;
  try { jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-local-dev'); return true; }
  catch { return false; }
}

export async function POST(req: NextRequest) {
  const cs = await cookies();
  if (!await requireAdmin(cs)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { clientId, tenantId = 'default', initiatedBy = 'admin' } = await req.json();
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  // Run synchronously (Vercel Function with maxDuration=300)
  const result = await runInstallFlow({ tenantId, clientId, initiatedBy });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/activation/run/route.ts
 * POST { clientId, tenantId? }
 * → Triggers runFirstActivation for a client.
 * Called by install flow and directly testable from admin.
 *
 * app/api/activation/boost/route.ts
 * POST { clientId? }
 * → Client "Grow My Site" button handler.
 *    Adds 3-5 growth events + returns them for instant UI feedback.
 *    No auth required (client-facing).
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import jwt                           from 'jsonwebtoken';
import { runFirstActivation }        from '@/lib/activation/runFirstActivation';

export const dynamic    = 'force-dynamic';
export const maxDuration = 120;

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

  const result = await runFirstActivation({ tenantId, clientId });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

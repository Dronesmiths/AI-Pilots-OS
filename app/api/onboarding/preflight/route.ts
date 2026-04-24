/**
 * app/api/onboarding/preflight/route.ts
 *
 * POST /api/onboarding/preflight
 *
 * Validates a tenant's inputs before activation.
 * Call this BEFORE /api/onboarding/activate.
 *
 * 200 — all checks passed
 * 400 — one or more checks failed (check result.checks for details)
 * 401 — no admin session
 * 500 — orchestrator threw
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { runPreflight }              from '@/lib/onboarding/preflight';
import type { PreflightInput }       from '@/lib/onboarding/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cs = await cookies();
  const session = cs.get('admin_session')?.value ?? cs.get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Partial<PreflightInput>;

    if (!body.domain || !body.repoUrl) {
      return NextResponse.json(
        { error: 'domain and repoUrl are required' },
        { status: 400 }
      );
    }

    const result = await runPreflight({
      domain:     body.domain.trim(),
      repoUrl:    body.repoUrl.trim(),
      gscSiteUrl: body.gscSiteUrl?.trim(),
      tenantId:   body.tenantId?.trim(),
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });

  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'Preflight failed', detail: e?.message },
      { status: 500 }
    );
  }
}

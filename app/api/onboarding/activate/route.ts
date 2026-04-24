/**
 * app/api/onboarding/activate/route.ts
 *
 * POST /api/onboarding/activate
 *
 * The single entry point to activate a new tenant in the AI Pilots OS.
 *
 * Body: { domain: string, repoUrl: string, gscSiteUrl?: string, name?: string }
 *
 * 200 — fully activated
 * 207 — partial (check steps in response body for which step failed)
 * 400 — missing required fields
 * 401 — no admin session
 * 500 — crash before any step completed
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import { activateTenant }            from '@/lib/onboarding/activateTenant';
import { runPreflight }              from '@/lib/onboarding/preflight';
import type { ActivateTenantInput }  from '@/lib/onboarding/types';

export const dynamic = 'force-dynamic';

function isValidInput(body: Partial<ActivateTenantInput>): body is ActivateTenantInput {
  return typeof body.domain === 'string' && body.domain.trim().length > 0
      && typeof body.repoUrl === 'string' && body.repoUrl.trim().length > 0;
}

export async function POST(req: NextRequest) {
  // Auth gate — admin session required
  const cs = await cookies();
  const session = cs.get('admin_session')?.value ?? cs.get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Partial<ActivateTenantInput>;

    if (!isValidInput(body)) {
      return NextResponse.json(
        { error: 'domain and repoUrl are required' },
        { status: 400 }
      );
    }

    // ── Preflight gate ────────────────────────────────────────────────────────
    const preflight = await runPreflight({
      domain:     body.domain.trim(),
      repoUrl:    body.repoUrl.trim(),
      gscSiteUrl: body.gscSiteUrl?.trim(),
    });

    if (!preflight.ok) {
      return NextResponse.json(
        { error: 'Preflight failed — fix issues before activating', preflight },
        { status: 400 }
      );
    }

    const result = await activateTenant({
      domain:     body.domain.trim(),
      repoUrl:    body.repoUrl.trim(),
      gscSiteUrl: body.gscSiteUrl?.trim(),
      name:       body.name?.trim(),
    });

    // 207 Multi-Status for partial: request processed, not fully completed
    const statusCode = result.status === 'activated' ? 200 : 207;
    return NextResponse.json(result, { status: statusCode });

  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to activate tenant' },
      { status: 500 }
    );
  }
}

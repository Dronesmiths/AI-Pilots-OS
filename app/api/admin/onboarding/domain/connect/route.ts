/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/onboarding/domain/connect/route.ts
 * POST { clientId, tenantId, domain, repoUrl?, repoBranch? }
 * → normalizes domain, checks reachability, upserts ConnectedDomain
 */
import { NextRequest, NextResponse }       from 'next/server';
import { cookies }                         from 'next/headers';
import jwt                                 from 'jsonwebtoken';
import connectToDatabase                   from '@/lib/mongodb';
import ConnectedDomain                     from '@/models/onboarding/ConnectedDomain';
import { connectDomain }                   from '@/lib/onboarding/connectDomain';
import { parseGithubRepo, verifyGithubRepoAccess } from '@/lib/onboarding/parseGithubRepo';
import OnboardingSession                   from '@/models/onboarding/OnboardingSession';

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

  const { clientId, tenantId = 'default', domain: rawDomain, repoUrl, repoBranch = 'main' } = await req.json();
  if (!clientId || !rawDomain) return NextResponse.json({ error: 'clientId and domain required' }, { status: 400 });

  await connectToDatabase();

  // Connect + normalize domain
  const result = await connectDomain(tenantId, clientId, rawDomain);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Optionally wire GitHub repo
  let githubResult: any = null;
  if (repoUrl) {
    const parsed = parseGithubRepo(repoUrl, repoBranch);
    if (parsed.isValid) {
      const access = await verifyGithubRepoAccess(parsed.owner, parsed.name);
      await ConnectedDomain.updateOne(
        { tenantId, clientId },
        {
          $set: {
            'hosting.repoUrl':       parsed.repoUrl,
            'hosting.repoOwner':     parsed.owner,
            'hosting.repoName':      parsed.name,
            'hosting.repoBranch':    access.defaultBranch || repoBranch,
            'hosting.provider':      access.provider,
            'hosting.githubWritable': access.writable,
          },
        }
      );
      await OnboardingSession.updateOne(
        { tenantId, clientId },
        { $set: { 'connections.githubConnected': parsed.isValid, 'connections.deployTargetReady': access.writable } }
      );
      githubResult = { owner: parsed.owner, repo: parsed.name, writable: access.writable, provider: access.provider, error: access.error };
    } else {
      githubResult = { error: parsed.error };
    }
  }

  return NextResponse.json({
    ok:      true,
    domain:  result.domain,
    warning: result.warning,
    github:  githubResult,
  });
}

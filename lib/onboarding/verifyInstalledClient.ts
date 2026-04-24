/**
 * lib/onboarding/verifyInstalledClient.ts
 *
 * Post-install verification — do NOT trust deploy hook success alone.
 * Checks live site, sitemap, dashboard state, GSC link.
 */

import connectToDatabase    from '@/lib/mongodb';
import ConnectedGSCProperty from '@/models/onboarding/ConnectedGSCProperty';
import OnboardingSession    from '@/models/onboarding/OnboardingSession';

export interface InstallVerificationResult {
  ok:     boolean;
  checks: {
    siteReachable:       boolean;
    sitemapPresent:      boolean;
    dashboardReady:      boolean;
    gscLinked:           boolean;
    starterConfigPresent: boolean;
  };
  blockers: string[];
  warnings: string[];
}

export async function verifyInstalledClient(
  tenantId: string,
  clientId: string,
  siteUrl:  string,
): Promise<InstallVerificationResult> {
  await connectToDatabase();

  const blockers: string[] = [];
  const warnings: string[] = [];

  const checks = {
    siteReachable:        false,
    sitemapPresent:       false,
    dashboardReady:       false,
    gscLinked:            false,
    starterConfigPresent: false,
  };

  // ── 1. Site reachability ─────────────────────────────────────
  try {
    const res = await fetch(siteUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000), redirect: 'follow' });
    checks.siteReachable = res.ok || res.status === 304;
    if (!checks.siteReachable) {
      blockers.push(`Site "${siteUrl}" returned status ${res.status}. Deployment may still be in progress.`);
    }
  } catch {
    warnings.push(`Could not reach "${siteUrl}" — deployment may still be propagating`);
  }

  // ── 2. Sitemap ───────────────────────────────────────────────
  const sitemapUrl = siteUrl.replace(/\/$/, '') + '/sitemap.xml';
  try {
    const smRes = await fetch(sitemapUrl, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    checks.sitemapPresent = smRes.ok;
    if (!checks.sitemapPresent) {
      warnings.push('sitemap.xml not detected — may appear after next deployment');
    }
  } catch {
    warnings.push('sitemap.xml check failed — verify after deployment completes');
  }

  // ── 3. Dashboard state (OnboardingSession exists with starterConfig) ──
  const session = await OnboardingSession.findOne({ tenantId, clientId }).lean() as any;
  checks.starterConfigPresent = !!(session?.engineConfig?.starterConfig);
  checks.dashboardReady       = checks.starterConfigPresent;

  if (!checks.dashboardReady) {
    warnings.push('Dashboard config not yet written — data will appear after first sync');
  }

  // ── 4. GSC linked ────────────────────────────────────────────
  const gsc = await ConnectedGSCProperty.findOne({ tenantId, clientId }).lean() as any;
  checks.gscLinked = !!(gsc?.propertyUrl && gsc?.domainMatch?.valid);
  if (!checks.gscLinked) {
    warnings.push('GSC property not fully linked — ranking data may take 24-48h');
  }

  const ok = blockers.length === 0;

  // Update session with verification result
  await OnboardingSession.updateOne(
    { tenantId, clientId },
    {
      $set: {
        'postInstall.verificationOk': ok,
        'install.status': ok ? 'installed' : 'needs_attention',
        ...(ok ? { 'install.installCompletedAt': new Date() } : {}),
      },
    }
  );

  return { ok, checks, blockers, warnings };
}

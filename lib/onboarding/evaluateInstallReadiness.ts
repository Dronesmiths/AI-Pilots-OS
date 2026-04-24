/**
 * lib/onboarding/evaluateInstallReadiness.ts
 *
 * Evaluates whether a client is ready to install.
 * Always re-run fresh — never trust a cached result at install time.
 *
 * Scoring:
 *   Each required field = 10 pts (max 100)
 *   Warnings reduce score by 5 pts each (not blockers)
 *
 * Ready = score >= 70 AND blockers.length === 0
 */

import connectToDatabase          from '@/lib/mongodb';
import OnboardingSession          from '@/models/onboarding/OnboardingSession';
import ConnectedDomain            from '@/models/onboarding/ConnectedDomain';
import ConnectedGSCProperty       from '@/models/onboarding/ConnectedGSCProperty';

export interface InstallReadiness {
  score:    number;
  ready:    boolean;
  blockers: string[];
  warnings: string[];
}

export async function evaluateInstallReadiness(
  tenantId: string,
  clientId: string,
): Promise<InstallReadiness> {
  await connectToDatabase();

  const [session, domain, gsc] = await Promise.all([
    OnboardingSession.findOne({ tenantId, clientId }).lean(),
    ConnectedDomain.findOne({ tenantId, clientId }).lean(),
    ConnectedGSCProperty.findOne({ tenantId, clientId }).lean(),
  ]);

  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 0;

  // ── Business fields ─────────────────────────────────────────────────
  if (session?.business?.name) {
    score += 10;
  } else {
    blockers.push('Business name is required');
  }

  if (session?.business?.domain) {
    score += 10;
  } else {
    blockers.push('Domain is required');
  }

  if (session?.business?.niche) {
    score += 10;
  } else {
    blockers.push('Business niche/industry is required');
  }

  if (session?.business?.city || session?.engineConfig?.targetGeo) {
    score += 10;
  } else {
    warnings.push('City/location will improve SEO targeting');
  }

  // ── Domain connection ────────────────────────────────────────────────
  if (domain && domain.normalizedDomain) {
    score += 10;
    if (!domain.crawlState?.reachable) {
      const failures = domain.crawlState?.consecutiveFailures ?? 0;
      if (failures >= 3) {
        blockers.push(`Domain "${domain.domain}" is not reachable after ${failures} checks`);
      } else {
        warnings.push(`Domain "${domain.domain}" was unreachable on last check — will retry at install`);
      }
    }
    if (!domain.crawlState?.sitemapFound) {
      warnings.push('No sitemap.xml detected — one will be created during install');
    }
    if (!domain.crawlState?.robotsFound) {
      warnings.push('No robots.txt detected — verify after install');
    }
  } else {
    blockers.push('Domain not connected — enter and save your domain');
  }

  // ── GitHub / deploy target ───────────────────────────────────────────
  if (domain?.hosting?.repoOwner && domain?.hosting?.repoName) {
    score += 10;
    if (!domain.hosting.githubWritable) {
      blockers.push('GitHub repository is not writable — check your GitHub token permissions');
    }
  } else {
    blockers.push('GitHub repository not connected — required for deployment');
  }

  // ── GSC connection ───────────────────────────────────────────────────
  if (gsc && gsc.propertyUrl) {
    score += 15;
    if (!gsc.domainMatch?.valid) {
      blockers.push(`GSC property "${gsc.propertyUrl}" does not match domain "${domain?.domain}" — select the correct property`);
    } else {
      score += 5; // bonus for valid match
    }
    if (!gsc.access?.testFetchSuccess) {
      warnings.push('GSC test query has not succeeded yet — data may take 24h to appear');
    }
  } else {
    blockers.push('Google Search Console property not attached');
  }

  // ── Engine config ────────────────────────────────────────────────────
  if ((session?.engineConfig?.defaultServicePages?.length ?? 0) > 0) {
    score += 5;
  } else {
    warnings.push('No starter service pages defined — generic pages will be used');
  }

  if (session?.engineConfig?.siteType) {
    score += 5;
  }

  // ── Penalize warnings ────────────────────────────────────────────────
  score = Math.max(0, score - warnings.length * 3);
  score = Math.min(100, score);

  const ready = blockers.length === 0 && score >= 60;

  // Persist readiness snapshot
  await OnboardingSession.updateOne(
    { tenantId, clientId },
    {
      $set: {
        'readiness.score':          score,
        'readiness.blockers':       blockers,
        'readiness.warnings':       warnings,
        'readiness.ready':          ready,
        'readiness.lastEvaluatedAt': new Date(),
        ...(ready && { 'install.status': 'ready' }),
      },
    }
  );

  return { score, ready, blockers, warnings };
}

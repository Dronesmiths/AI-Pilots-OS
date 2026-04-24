/**
 * lib/onboarding/preflight.ts
 *
 * Runs all 4 checks in parallel (Promise.all) — target: ≤ 2s total.
 *
 * Domain + repo + logging run fast in parallel.
 * GSC is the slowest (Google API auth + list call) but still within 2s.
 *
 * result.ok = ALL checks passed. Partial failure still returns individual results
 * so the UI can show exactly which check failed and why.
 */
import { validateDomain }  from './validators/validateDomain';
import { validateRepo }    from './validators/validateRepo';
import { validateGSC }     from './validators/validateGSC';
import { validateLogging } from './validators/validateLogging';
import type { PreflightInput, PreflightResult } from './types';

export async function runPreflight(input: PreflightInput): Promise<PreflightResult> {
  const start = Date.now();

  const [domain, repo, gsc, logging] = await Promise.all([
    validateDomain(input.domain),
    validateRepo(input.repoUrl),
    validateGSC(input.gscSiteUrl),
    validateLogging(input.tenantId),
  ]);

  const ok = domain.ok && repo.ok && gsc.ok && logging.ok;

  return {
    ok,
    checks:     { domain, repo, gsc, logging },
    durationMs: Date.now() - start,
  };
}

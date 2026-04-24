/**
 * lib/onboarding/validators/validateDomain.ts
 *
 * Preflight check: is the domain reachable?
 *
 * Delegates to the existing checkDomainReachability helper which does
 * HEAD checks + sitemap/robots.txt detection. We treat any reachable
 * response (including redirects) as a pass — we're not validating
 * content, just connectivity.
 */
import { checkDomainReachability } from '@/lib/onboarding/checkDomainReachability';
import type { PreflightCheckResult } from '../types';

export async function validateDomain(domain: string): Promise<PreflightCheckResult> {
  try {
    const result = await checkDomainReachability(domain);
    if (!result.reachable) {
      return { ok: false, message: result.error || 'Domain not reachable' };
    }
    return {
      ok:   true,
      meta: {
        statusCode:   result.statusCode,
        sitemapFound: result.sitemapFound,
        robotsFound:  result.robotsFound,
      },
    };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Domain check failed' };
  }
}

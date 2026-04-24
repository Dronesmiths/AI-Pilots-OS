/**
 * lib/onboarding/checkDomainReachability.ts
 *
 * Non-blocking HTTP check for a domain.
 * Guesses sitemap/robots.txt URLs automatically.
 *
 * Policy (from user spec):
 *   - Warn on first failure, do NOT block onboarding
 *   - Block only on consecutive failures (stored in ConnectedDomain)
 */

export interface DomainReachabilityResult {
  reachable:    boolean;
  statusCode:   number;
  sitemapUrl:   string;
  robotsUrl:    string;
  sitemapFound: boolean;
  robotsFound:  boolean;
  error:        string;
  warning:      string; // non-blocking message
}

export async function checkDomainReachability(
  urlPrefix: string,  // https://www.example.com/
  timeoutMs = 8000,
): Promise<DomainReachabilityResult> {
  const base: DomainReachabilityResult = {
    reachable:    false,
    statusCode:   0,
    sitemapUrl:   `${urlPrefix}sitemap.xml`,
    robotsUrl:    `${urlPrefix}robots.txt`,
    sitemapFound: false,
    robotsFound:  false,
    error:        '',
    warning:      '',
  };

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    let statusCode = 0;
    try {
      const res = await fetch(urlPrefix, {
        method: 'HEAD',
        signal: ctrl.signal,
        redirect: 'follow',
      });
      statusCode = res.status;
    } finally {
      clearTimeout(timer);
    }

    const reachable = statusCode >= 200 && statusCode < 400;

    // Guess sitemap location
    let sitemapUrl  = `${urlPrefix}sitemap.xml`;
    let sitemapFound = false;
    try {
      const sm = await fetch(sitemapUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
      if (sm.ok) {
        sitemapFound = true;
      } else {
        // Try sitemap_index.xml
        const sm2 = await fetch(`${urlPrefix}sitemap_index.xml`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
        if (sm2.ok) { sitemapUrl = `${urlPrefix}sitemap_index.xml`; sitemapFound = true; }
      }
    } catch { /* sitemap not found — not a blocker */ }

    // Guess robots.txt
    const robotsUrl = `${urlPrefix}robots.txt`;
    let robotsFound  = false;
    try {
      const rb = await fetch(robotsUrl, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      robotsFound = rb.ok;
    } catch { /* not a blocker */ }

    return {
      reachable,
      statusCode,
      sitemapUrl:   sitemapFound ? sitemapUrl : base.sitemapUrl,
      robotsUrl,
      sitemapFound,
      robotsFound,
      error:        reachable ? '' : `Site returned status ${statusCode}`,
      warning:      !reachable ? 'Site is not currently reachable. Onboarding can continue.' : '',
    };
  } catch (err: any) {
    return {
      ...base,
      error:   `Connection failed: ${err.message}`,
      warning: 'Could not reach site — this is a warning only. Onboarding can still proceed.',
    };
  }
}

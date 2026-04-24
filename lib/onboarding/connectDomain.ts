/**
 * lib/onboarding/connectDomain.ts
 *
 * Creates/updates ConnectedDomain + OnboardingSession from a raw domain input.
 * Runs normalization + reachability check.
 * Always idempotent — safe to call multiple times.
 */

import connectToDatabase            from '@/lib/mongodb';
import ConnectedDomain              from '@/models/onboarding/ConnectedDomain';
import OnboardingSession            from '@/models/onboarding/OnboardingSession';
import { normalizeDomain }          from './normalizeDomain';
import { checkDomainReachability }  from './checkDomainReachability';

export interface ConnectDomainResult {
  ok:      boolean;
  domain:  string;
  warning: string;
  error:   string;
}

export async function connectDomain(
  tenantId:    string,
  clientId:    string,
  rawInput:    string,
): Promise<ConnectDomainResult> {
  await connectToDatabase();

  const nd = normalizeDomain(rawInput);
  if (!nd.isValid) {
    return { ok: false, domain: '', warning: '', error: nd.error };
  }

  // Check reachability (non-blocking)
  const reach = await checkDomainReachability(nd.urlPrefix);

  // Upsert ConnectedDomain
  const existing = await ConnectedDomain.findOne({ tenantId, clientId }).lean() as any;
  const failures = reach.reachable ? 0 : (existing?.crawlState?.consecutiveFailures ?? 0) + 1;

  await ConnectedDomain.findOneAndUpdate(
    { tenantId, clientId },
    {
      $set: {
        rawInput:         rawInput,
        domain:           nd.normalizedDomain,
        normalizedDomain: nd.normalizedDomain,
        host:             nd.host,
        urlPrefix:        nd.urlPrefix,
        domainProperty:   nd.domainProperty,
        'crawlState.sitemapUrl':           reach.sitemapUrl,
        'crawlState.robotsUrl':            reach.robotsUrl,
        'crawlState.reachable':            reach.reachable,
        'crawlState.statusCode':           reach.statusCode,
        'crawlState.lastCheckedAt':        new Date(),
        'crawlState.consecutiveFailures':  failures,
        'verification.status':             'pending',
      },
    },
    { upsert: true, new: true }
  );

  // Update session
  await OnboardingSession.updateOne(
    { tenantId, clientId },
    {
      $set: {
        'business.domain':           nd.normalizedDomain,
        'connections.domainConnected': true,
        'connections.domainVerified':  false,
        'install.status':              'collecting',
      },
    }
  );

  return {
    ok:      true,
    domain:  nd.normalizedDomain,
    warning: reach.warning,
    error:   '',
  };
}

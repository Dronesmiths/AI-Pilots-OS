/**
 * lib/onboarding/attachGSCProperty.ts
 *
 * Attaches a GSC property to a client.
 * Uses the existing service account pattern (GOOGLE_CREDENTIALS_JSON).
 * Runs an immediate test fetch to validate query access.
 *
 * Also calls validateGSCPropertyMatch inline so one call does both.
 */

import connectToDatabase      from '@/lib/mongodb';
import ConnectedGSCProperty   from '@/models/onboarding/ConnectedGSCProperty';
import ConnectedDomain        from '@/models/onboarding/ConnectedDomain';
import OnboardingSession      from '@/models/onboarding/OnboardingSession';
import { google }             from 'googleapis';
import { validateGSCPropertyMatch } from './validateGSCPropertyMatch';

export interface AttachGSCResult {
  ok:               boolean;
  propertyUrl:      string;
  propertyType:     string;
  matchValid:       boolean;
  matchType:        string;
  testFetchSuccess: boolean;
  warnings:         string[];
  error:            string;
}

function getGSCAuth() {
  let rawCreds = process.env.GOOGLE_CREDENTIALS_JSON || '{}';
  rawCreds = rawCreds.replace(/[\u0000-\u001F]/g, m => {
    if (m === '\n') return '\\n';
    if (m === '\r') return '';
    if (m === '\t') return '\\t';
    return '';
  });
  const creds = JSON.parse(rawCreds);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
}

export async function attachGSCProperty(
  tenantId:    string,
  clientId:    string,
  propertyUrl: string, // exact GSC property URL
): Promise<AttachGSCResult> {
  await connectToDatabase();

  const domain = await ConnectedDomain.findOne({ tenantId, clientId }).lean() as any;
  const warnings: string[] = [];

  // Determine property type
  const propertyType = propertyUrl.startsWith('sc-domain:') ? 'domain' : 'url_prefix';

  // Validate match against connected domain
  const matchResult = validateGSCPropertyMatch(
    propertyUrl,
    domain?.normalizedDomain ?? '',
    domain?.urlPrefix ?? '',
  );
  if (!matchResult.valid) {
    warnings.push(...matchResult.warnings);
  }

  // Test fetch via Search Console API
  let testFetchSuccess = false;
  let serviceAccountEmail = '';
  try {
    const auth = getGSCAuth();
    const client = await auth.getClient() as any;
    serviceAccountEmail = client.email ?? '';
    const sc = google.searchconsole({ version: 'v1', auth });
    // List sites — if property is accessible, it will appear
    const siteList = await sc.sites.list();
    const sites = siteList.data.siteEntry ?? [];
    const found = sites.some((s: any) =>
      s.siteUrl === propertyUrl ||
      s.siteUrl === propertyUrl.replace(/\/$/, '') + '/'
    );
    testFetchSuccess = found;
    if (!found) {
      warnings.push(`Property "${propertyUrl}" not found in service account's accessible sites — ensure it is added to Search Console`);
    }
  } catch (err: any) {
    warnings.push(`GSC test fetch failed: ${err.message}`);
  }

  // Upsert
  await ConnectedGSCProperty.findOneAndUpdate(
    { tenantId, clientId },
    {
      $set: {
        propertyUrl,
        propertyType,
        verified: matchResult.valid && testFetchSuccess,
        'serviceAccount.email':       serviceAccountEmail,
        'serviceAccount.connectedAt': new Date(),
        'access.canQueryPerformance': testFetchSuccess,
        'access.canInspectIndexing':  testFetchSuccess,
        'access.testFetchSuccess':    testFetchSuccess,
        'domainMatch.valid':          matchResult.valid,
        'domainMatch.matchType':      matchResult.matchType,
        'domainMatch.warnings':       matchResult.warnings,
      },
    },
    { upsert: true, new: true }
  );

  // Update session
  await OnboardingSession.updateOne(
    { tenantId, clientId },
    {
      $set: {
        'connections.gscConnected':        true,
        'connections.gscPropertyVerified': matchResult.valid,
      },
    }
  );

  return {
    ok:          true,
    propertyUrl,
    propertyType,
    matchValid:       matchResult.valid,
    matchType:        matchResult.matchType,
    testFetchSuccess,
    warnings,
    error:       '',
  };
}

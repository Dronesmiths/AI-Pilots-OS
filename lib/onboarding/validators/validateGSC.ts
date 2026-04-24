/**
 * lib/onboarding/validators/validateGSC.ts
 *
 * Preflight check: is the GSC property accessible by the service account?
 *
 * This is a SOFT check — if gscSiteUrl is not provided, we pass immediately.
 * GSC is optional at activation time (the client can connect it later).
 *
 * Uses GOOGLE_CREDENTIALS_JSON (the existing env var used throughout the system).
 * NOT the spec's GSC_SERVICE_ACCOUNT_JSON — that doesn't exist in this codebase.
 */
import { google } from 'googleapis';
import type { PreflightCheckResult } from '../types';

export async function validateGSC(siteUrl?: string): Promise<PreflightCheckResult> {
  if (!siteUrl) {
    return { ok: true, message: 'GSC optional — skipped' };
  }

  const credsRaw = process.env.GOOGLE_CREDENTIALS_JSON ?? '{}';
  if (credsRaw === '{}') {
    return { ok: false, message: 'Missing GOOGLE_CREDENTIALS_JSON env variable' };
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(credsRaw),
      scopes:      ['https://www.googleapis.com/auth/webmasters.readonly'],
    });

    const client     = await auth.getClient();
    const webmasters = google.webmasters({ version: 'v3', auth: client as any });
    const res        = await webmasters.sites.list();
    const sites      = res.data.siteEntry ?? [];

    const match = sites.find(s => s.siteUrl === siteUrl);
    if (!match) {
      return {
        ok:      false,
        message: `GSC property "${siteUrl}" not accessible by service account — add the service account email as a verified owner in Search Console`,
      };
    }

    return { ok: true, meta: { permissionLevel: match.permissionLevel } };
  } catch (e: any) {
    return { ok: false, message: `GSC validation failed: ${e?.message ?? 'unknown error'}` };
  }
}

/**
 * lib/gsc/gscClient.ts
 *
 * Shared GSC auth factory — matches the existing pattern in
 * lib/onboarding/attachGSCProperty.ts (GOOGLE_CREDENTIALS_JSON env var).
 *
 * Returns a Search Console v1 client (searchconsole v1 has searchAnalytics.query).
 * The auth client is re-used across calls by googleapis' internal caching.
 *
 * Env required:
 *   GOOGLE_CREDENTIALS_JSON — service account JSON (stringified)
 *   GSC_SITE_URL            — e.g. "sc-domain:yourdomain.com" or "https://yourdomain.com/"
 */
import { google } from 'googleapis';

function buildAuth() {
  let raw = process.env.GOOGLE_CREDENTIALS_JSON ?? '{}';
  // Strip surrounding quotes Vercel may inject
  raw = raw.trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || 
      (raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith('{"'))) {
    raw = raw.slice(1, -1);
  }
  // Sanitize control characters
  raw = raw.replace(/[\u0000-\u001F]/g, m => {
    if (m === '\n') return '\\n';
    if (m === '\r') return '';
    if (m === '\t') return '\\t';
    return '';
  });
  // Handle double-escaped newlines from Vercel env
  raw = raw.replace(/\\\\n/g, '\\n');
  const creds = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
}

/** Returns a fully-authenticated Search Console v1 client */
export function getGSCClient() {
  const auth = buildAuth();
  return google.searchconsole({ version: 'v1', auth });
}

/** Returns the raw auth object (useful for listing sites, checking access) */
export function getGSCAuth() {
  return buildAuth();
}

/** Resolved GSC site URL from env (guaranteed non-empty or throws) */
export function getDefaultSiteUrl(): string {
  const url = process.env.GSC_SITE_URL;
  if (!url) throw new Error('GSC_SITE_URL env var is not set');
  return url;
}

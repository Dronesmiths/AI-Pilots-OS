/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * app/api/admin/onboarding/gsc/properties/route.ts
 * GET ?clientId=&tenantId=
 * → Lists GSC properties accessible via service account
 */
import { NextRequest, NextResponse } from 'next/server';
import { cookies }                   from 'next/headers';
import jwt                           from 'jsonwebtoken';
import { google }                    from 'googleapis';

export const dynamic = 'force-dynamic';

async function requireAdmin(cs: any) {
  const token = cs.get('admin_token')?.value;
  if (!token) return false;
  try { jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret-for-local-dev'); return true; }
  catch { return false; }
}

function getGSCAuth() {
  let rawCreds = process.env.GOOGLE_CREDENTIALS_JSON || '{}';
  rawCreds = rawCreds.replace(/[\u0000-\u001F]/g, m => m === '\n' ? '\\n' : m === '\r' ? '' : m === '\t' ? '\\t' : '');
  const creds = JSON.parse(rawCreds);
  return new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/webmasters.readonly'] });
}

export async function GET(req: NextRequest) {
  const cs = await cookies();
  if (!await requireAdmin(cs)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const auth = getGSCAuth();
    const sc   = google.searchconsole({ version: 'v1', auth });
    const res  = await sc.sites.list();
    const sites = (res.data.siteEntry ?? []).map((s: any) => ({
      propertyUrl:     s.siteUrl,
      propertyType:    s.siteUrl?.startsWith('sc-domain:') ? 'domain' : 'url_prefix',
      permissionLevel: s.permissionLevel,
    }));
    return NextResponse.json({ ok: true, properties: sites, count: sites.length });
  } catch (err: any) {
    return NextResponse.json({ error: `GSC list failed: ${err.message}` }, { status: 500 });
  }
}

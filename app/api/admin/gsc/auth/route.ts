/**
 * GET /api/admin/gsc/auth?tenantId=xxx
 *
 * Initiates Google OAuth 2.0 flow for Search Console access.
 * Redirects the admin browser to Google's consent screen.
 * On approval, Google sends user back to /api/admin/gsc/callback.
 *
 * Required env vars:
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   NEXT_PUBLIC_APP_URL  (e.g. https://your-crm.vercel.app)
 */

import { NextRequest, NextResponse } from 'next/server';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',  // Search Console read
  'https://www.googleapis.com/auth/webmasters',            // URL Inspection
].join(' ');

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'Missing tenantId' }, { status: 400 });

  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/gsc/callback`;

  if (!clientId) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID not configured. Add it to your .env file.' },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',    // get refresh token
    prompt:        'consent',    // force refresh token even if previously granted
    state:         tenantId,     // pass tenantId through the OAuth round-trip
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}

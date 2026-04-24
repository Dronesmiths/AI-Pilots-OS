/**
 * GET /api/admin/gsc/callback?code=xxx&state=tenantId
 *
 * Google redirects here after the user approves GSC access.
 * Exchanges the auth code for access + refresh tokens,
 * then fetches the first verified site from Search Console
 * and saves everything to the tenant's User document.
 *
 * Redirects admin back to: /admin/{tenantId}/pilot-view?tab=repair
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get('code');
  const tenantId = req.nextUrl.searchParams.get('state');  // passed through OAuth state

  if (!code || !tenantId) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri  = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/gsc/callback`;
  const appUrl       = process.env.NEXT_PUBLIC_APP_URL!;

  try {
    // ── 1. Exchange code for tokens ────────────────────────────────────────
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokens.refresh_token) {
      return NextResponse.json(
        { error: 'No refresh token returned. Revoke access in Google Account and try again.' },
        { status: 400 }
      );
    }

    // ── 2. Fetch site list from Search Console ─────────────────────────────
    const sitesRes = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const sitesData = await sitesRes.json();
    const sites: any[] = sitesData.siteEntry || [];

    // Pick the best verified site (prefer sc-domain: over https://)
    const preferred = sites.find(s => s.permissionLevel === 'siteOwner') || sites[0];
    const gscSiteProperty = preferred?.siteUrl || '';

    // ── 3. Persist to DB ───────────────────────────────────────────────────
    await connectToDatabase();
    await User.findByIdAndUpdate(tenantId, {
      $set: {
        googleRefreshToken: tokens.refresh_token,
        gscSiteProperty,
        gscConnectedAt: new Date(),
      },
    });

    // ── 4. Redirect back to Repair Bay ────────────────────────────────────
    return NextResponse.redirect(`${appUrl}/admin/${tenantId}/pilot-view?gscConnected=true`);

  } catch (err: any) {
    console.error('[gsc/callback]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

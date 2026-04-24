/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized to bond Google Sandbox' }, { status: 401 });
    }

    // Initialize the primary Google OAuth Framework
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://dashboard.aipilots.site/api/oauth/google/callback'
    );

    // Provide maximum read/write capability to strictly their Calendar blocks & Google Business Profiles
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/business.manage'
    ];

    // Build the dynamic URL. We inject their current active `token` directly 
    // into the `state` prop so we know WHO they are when Google bounces them back!
    const authorizationUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Demands a Refresh Token dynamically from Google
      scope: scopes,
      prompt: 'consent', // Forces Google to yield a brand new refresh token every time
      state: token // 🚀 Securely map their original JWT into the roundtrip
    });

    console.log(`[OAUTH] Outbound authorization URL physically constructed. Rerouting...`);

    // Force Next.js to navigate the frontend browser physically to the Google Consent Screen
    return NextResponse.redirect(authorizationUrl);
  } catch (error: any) {
    console.error('Error constructing Google OAuth path:', error.message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

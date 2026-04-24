/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized to bond Meta Sandbox' }, { status: 401 });
    }

    const clientId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
    const redirectUri = 'https://dashboard.aipilots.site/api/oauth/meta/callback';
    
    // We explicitly request WhatsApp business permissions because Meta Business Apps legally require at least one business scope to authorize a session
    const scopes = 'whatsapp_business_management,whatsapp_business_messaging';

    // Construct the Facebook Graph OAuth authorization URL
    const authorizationUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${token}&scope=${scopes}`;

    console.log(`[OAUTH] Meta Outbound authorization URL physically constructed. Rerouting...`);

    return NextResponse.redirect(authorizationUrl);
  } catch (error: any) {
    console.error('Error constructing Meta OAuth path:', error.message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

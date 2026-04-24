import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { google } from 'googleapis';

export async function GET() {
  try {
    await connectToDatabase();
    
    // Natively locate the master admin token
    const adminWithToken = await User.findOne({ googleRefreshToken: { $exists: true, $ne: '' } });
    
    if (!adminWithToken) {
      return NextResponse.json({ error: 'OAuth Not Bonded', authenticatingRequired: true }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://dashboard.aipilots.site/api/oauth/google/callback'
    );
    
    oauth2Client.setCredentials({ refresh_token: adminWithToken.googleRefreshToken });

    const resTokens = await oauth2Client.getAccessToken();
    const token = resTokens.token;

    if (!token) {
       return NextResponse.json({ error: 'Refresh token expired', authenticatingRequired: true }, { status: 401 });
    }

    // Natively fetch Google My Business Accounts
    const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (accountsRes.status === 403 || accountsRes.status === 401) {
      console.log(`[GMB ROUTER] Re-auth required: Admin token lacks business.manage scope.`);
      return NextResponse.json({ error: 'Missing business.manage scope', reauthRequired: true }, { status: 403 });
    }

    const accountsData = await accountsRes.json();
    const accounts = accountsData.accounts || [];
    
    if (accounts.length === 0) {
      return NextResponse.json({ locations: [] });
    }

    let allLocations: any[] = [];
    
    // Accumulate all physical properties mapped to the Master Account
    for (const account of accounts) {
      const locationsRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storeCode`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const locationsData = await locationsRes.json();
      
      if (locationsData.locations) {
        allLocations.push(...locationsData.locations.map((loc: any) => ({
            accountId: account.name,
            locationId: loc.name,
            title: loc.title
        })));
      }
    }

    return NextResponse.json({ locations: allLocations, authenticatingRequired: false });

  } catch (err: any) {
    console.error("[GMB ROUTER] Master Engine failure fetching map locations:", err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

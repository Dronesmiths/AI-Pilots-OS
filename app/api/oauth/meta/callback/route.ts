/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.json({ error: 'OAuth missing critical verification parameters from Meta.' }, { status: 400 });
    }

    // 1. Verify exactly WHO this user is securely utilizing our own active JWT state
    const decoded = jwt.verify(state, JWT_SECRET) as any;
    const userEmail = decoded.email.toLowerCase().trim();

    // 2. Exchange the mathematical code for a Short-Lived Access Token via Graph API
    const clientId = process.env.META_APP_ID || process.env.NEXT_PUBLIC_META_APP_ID;
    const clientSecret = process.env.META_CLIENT_SECRET;
    const redirectUri = 'https://dashboard.aipilots.site/api/oauth/meta/callback';

    const tokenResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`);
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Meta Token Exchange Error:', errorData);
      return NextResponse.json({ error: 'Failed to negotiate token exchange with Meta Graph.' }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const shortLivedToken = tokenData.access_token;

    // 3. Exchange the short-lived vulnerability token for a Long-Lived permanent User Access Token
    const longLivedResponse = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`);
    
    let finalToken = shortLivedToken;
    if (longLivedResponse.ok) {
        const longData = await longLivedResponse.json();
        finalToken = longData.access_token || shortLivedToken;
    }

    // 4. Physically store the token firmly into MongoDB
    await connectToDatabase();
    const userProfile = await User.findOne({ email: userEmail });

    if (!userProfile) {
      return NextResponse.json({ error: 'Database User not found during Meta OAuth intercept.' }, { status: 404 });
    }

    // 4.5. Autonomously traverse the Meta Graph API to isolate the required WhatsApp Sender Phone ID
    let fetchedPhoneId = '';
    try {
      const bizRes = await fetch(`https://graph.facebook.com/v19.0/me/businesses?access_token=${finalToken}`);
      const bizData = await bizRes.json();
      
      if (bizData.data && bizData.data.length > 0) {
        // Iterate through businesses to find an active WABA
        for (const biz of bizData.data) {
          const wabaRes = await fetch(`https://graph.facebook.com/v19.0/${biz.id}/owned_whatsapp_business_accounts?access_token=${finalToken}`);
          const wabaData = await wabaRes.json();
          
          if (wabaData.data && wabaData.data.length > 0) {
            const wabaId = wabaData.data[0].id;
            const phoneRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/phone_numbers?access_token=${finalToken}`);
            const phoneData = await phoneRes.json();
            
            if (phoneData.data && phoneData.data.length > 0) {
              fetchedPhoneId = phoneData.data[0].id; // The absolute Sender ID Node
              break; // Lock it in and exit traversal
            }
          }
        }
      }
    } catch (e: any) {
      console.warn("[OAUTH] Autonomous WhatsApp Phone ID traversal failed silently:", e.message);
    }

    // Mark it connected!
    userProfile.whatsappApiConnected = true;
    userProfile.metaAccessToken = finalToken;
    if (fetchedPhoneId) {
      userProfile.metaAccountId = fetchedPhoneId;
      console.log(`[OAUTH] Automatically bonded WhatsApp Sender ID: ${fetchedPhoneId}`);
    }
    
    await userProfile.save();
    console.log(`[OAUTH] Meta/WhatsApp API successfully bonded natively to ${userProfile.email}`);

    // 5. Force Next.js to neatly drop the user backward onto their core Completion Bar dashboard!
    return NextResponse.redirect('https://dashboard.aipilots.site/client-dashboard');

  } catch (error: any) {
    console.error('Error in Meta OAuth Callback Intercept:', error.message);
    return new NextResponse('Internal Server Error processing Meta Graph permissions.', { status: 500 });
  }
}

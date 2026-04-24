import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { userId, baseServices, targetLocations } = await req.json();
    if (!userId || !baseServices || !targetLocations) return NextResponse.json({ error: 'Missing core payload variables (Target Services & Locations required).' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible' }, { status: 404 });

    const customerId = user.googleAdsCustomerId;
    if (!customerId) return NextResponse.json({ error: 'Missing Google Ads Customer ID configuration.' }, { status: 400 });
    
    // Clean formatted customer id (e.g. 123-456-7890 -> 1234567890)
    const cleanCustomerId = customerId.replace(/[^0-9]/g, '');

    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!developerToken) return NextResponse.json({ error: 'Missing Google Ads Developer Token in environment matrix.' }, { status: 500 });
    if (!process.env.GOOGLE_CREDENTIALS_JSON) return NextResponse.json({ error: 'Missing Master Service Account JSON.' }, { status: 500 });

    const credentialsObj = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: credentialsObj.client_email, private_key: credentialsObj.private_key },
        scopes: ['https://www.googleapis.com/auth/adwords'],
    });

    const authClient = await auth.getClient() as any;
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;

    // Cross-multiply services with locations
    const serviceArray = baseServices.split(',').map((s: string) => s.trim()).filter(Boolean);
    const locationArray = targetLocations.split(',').map((l: string) => l.trim()).filter(Boolean);
    const seedKeywords: string[] = [];
    serviceArray.forEach((svc: string) => {
        locationArray.forEach((loc: string) => {
             seedKeywords.push(`${svc} ${loc}`);
        });
    });

    const endpoint = `https://googleads.googleapis.com/v16/customers/${cleanCustomerId}:generateKeywordIdeas`;

    const requestBody = {
        keywordSeed: { keywords: seedKeywords },
        language: 'languageConstants/1000', // EN
        keywordPlanNetwork: 'GOOGLE_SEARCH'
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.message || data[0]?.error?.message || 'Google Ads Graph rejection.');
    }

    const results = data.results || [];
    let injectedCount = 0;

    for (const item of results) {
        const keywordText = item.text;
        const metrics = item.keywordIdeaMetrics;
        if (!metrics) continue;

        const volume = Number(metrics.avgMonthlySearches || 0);
        const competition = metrics.competition || 'UNSPECIFIED';
        
        let cpc = 0;
        if (metrics.lowTopOfPageBidMicros && metrics.highTopOfPageBidMicros) {
            cpc = ((Number(metrics.lowTopOfPageBidMicros) + Number(metrics.highTopOfPageBidMicros)) / 2) / 1000000;
        } else if (metrics.highTopOfPageBidMicros) {
            cpc = Number(metrics.highTopOfPageBidMicros) / 1000000;
        } else if (metrics.lowTopOfPageBidMicros) {
            cpc = Number(metrics.lowTopOfPageBidMicros) / 1000000;
        }

        // Only inject if it has some volume to preserve DB memory
        if (volume > 0) {
            const exists = user.seoClusters.some((c: any) => c.keyword.toLowerCase() === keywordText.toLowerCase());
            if (!exists) {
                user.seoClusters.push({
                    keyword: keywordText,
                    category: 'service',
                    status: 'idea',
                    impressions: volume, // Mapping Search Volume directly into UI impressions
                    cpc: Number(cpc.toFixed(2)),
                    competition,
                    pushedAt: new Date()
                });
                injectedCount++;
            }
        }
    }

    if (injectedCount > 0) {
        await user.save();
    }

    return NextResponse.json({ 
        success: true, 
        message: `Extracted ${results.length} semantic variations and forcibly injected ${injectedCount} high-volume keywords into your Draft staging queue.`,
        clusters: user.seoClusters 
    });

  } catch (error: any) {
    console.error('[GOOGLE ADS EXTENSION ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error executing Keyword Planner API.' }, { status: 500 });
  }
}

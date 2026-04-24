import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch (e) {
      return NextResponse.json({ error: 'Invalid master key signature.' }, { status: 401 });
    }

    const { userId, ga4PropertyId } = await req.json();

    if (!userId || !ga4PropertyId) {
      return NextResponse.json({ error: 'Missing userId or GA4 Property ID.' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    // Instantly save the mapped GA4 ID back to the user document if provided
    if (user.ga4PropertyId !== ga4PropertyId) {
      user.ga4PropertyId = ga4PropertyId;
      await user.save();
    }

    let rawCreds = process.env.GOOGLE_CREDENTIALS_JSON || '{}';
    if (!rawCreds || rawCreds === '{}') {
        return NextResponse.json({ error: 'Global GOOGLE_CREDENTIALS_JSON missing. The master engine lacks Service Account access.' }, { status: 500 });
    }

    rawCreds = rawCreds.replace(/[\u0000-\u001F]/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '';
        if (match === '\t') return '\\t';
        return '';
    });
    
    const credentialsObj = JSON.parse(rawCreds);

    const analyticsDataClient = new BetaAnalyticsDataClient({
        credentials: {
            client_email: credentialsObj.client_email,
            private_key: credentialsObj.private_key,
        }
    });

    console.log(`[GA4 ENGINE] Connecting to Property: properties/${ga4PropertyId}`);

    const [response] = await analyticsDataClient.runReport({
      property: `properties/${ga4PropertyId}`,
      dateRanges: [
        {
          startDate: '30daysAgo',
          endDate: 'today',
        },
      ],
      dimensions: [
        { name: 'pagePath' }
      ],
      metrics: [
        { name: 'sessions' },
        { name: 'engagementRate' },
        { name: 'conversions' }
      ],
    });

    if (!response.rows) {
       return NextResponse.json({ success: true, message: 'Google Analytics 4 ping successful, but 0 data rows were returned for the last 30 days.' }, { status: 200 });
    }

    let matchCount = 0;

    for (const row of response.rows) {
        if (!row.dimensionValues || !row.metricValues) continue;

        const path = row.dimensionValues[0].value || '';
        const sessions = Number(row.metricValues[0].value || 0);
        const engagementRate = Number(row.metricValues[1].value || 0); // e.g. 0.85
        const conversions = Number(row.metricValues[2].value || 0);

        // Natively scan all deployed clusters for matching path signatures
        for (const cluster of user.seoClusters) {
            if (cluster.status === 'published' || cluster.status === 'Live') {
               const slug = (cluster.keyword || cluster.target || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
               
               // Match exactly against root slug or article sub-folder 
               if (path === `/${slug}` || path === `/${slug}/` || path === `/articles/${slug}` || path === `/articles/${slug}/` || path === `/${slug}.html` || path === `/articles/${slug}.html`) {
                   cluster.sessions = sessions;
                   // GA4 returns Engagement Rate as a decimal (e.g. 0.55). Convert to integer percentage.
                   cluster.engagementRate = Math.round(engagementRate * 100);
                   cluster.conversions = conversions;
                   matchCount++;
               }
            }
        }
    }

    await user.save();

    return NextResponse.json({ 
        success: true, 
        message: `GA4 Data successfully indexed! Mapped behavioral data to ${matchCount} active QA & Live Nodes out of ${response.rows.length} total crawled paths.`,
        clusters: user.seoClusters 
    }, { status: 200 });

  } catch (error: any) {
    console.error("[GA4 API CRASH]", error);
    return NextResponse.json({ error: `Analytics Read Crash: ${error.message}` }, { status: 500 });
  }
}

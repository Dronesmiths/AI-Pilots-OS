import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId parameter.' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible.' }, { status: 404 });

    const pageSpeedKey = user.pageSpeedApiKey || process.env.GOOGLE_PAGESPEED_API_KEY;
    const dfsLogin = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
    const dfsPwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;

    if (!pageSpeedKey && (!dfsLogin || !dfsPwd)) {
      return NextResponse.json({ error: 'Missing API Credentials. Must map either a free Google PageSpeed Key or active DataForSEO credentials.' }, { status: 400 });
    }

    const targetDomain = user.targetDomain || user.seoEngine;
    if (!targetDomain) {
      return NextResponse.json({ error: 'No Live Target Domain configured for this user.' }, { status: 400 });
    }
    
    // Clean to strict raw domain format
    const cleanDomain = targetDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '').trim();

    const liveClusters = user.seoClusters.filter((c: any) => c.status === 'Live' || c.status === 'published');
    if (liveClusters.length === 0) {
        return NextResponse.json({ error: 'No active Live nodes to track performance.' }, { status: 400 });
    }

    let updatedCount = 0;

    // Throttle checks organically to avoid overwhelming the V5 structure limits
    for (const cluster of liveClusters) {
        try {
            const rawSlug = cluster.slug || (cluster.keyword || cluster.target || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            // Attempt to hit the localized articles directory path for absolute certainty
            let testUrl = cluster.liveUrl || `https://${cleanDomain}/${rawSlug}`;
            
            // To ensure 100% correct Lighthouse parsing, always push strictly formatted URLs
            if (!testUrl.startsWith('http')) testUrl = `https://${testUrl}`;

            let performanceScoreRaw = null;

            if (pageSpeedKey) {
                const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(testUrl)}&strategy=MOBILE&key=${pageSpeedKey}`;
                const response = await fetch(endpoint, { method: 'GET' });
                const data = await response.json();
                
                if (!response.ok) {
                    console.warn(`[PAGESPEED] Node ${testUrl} rejected:`, data.error?.message || 'Unknown graph rejection');
                    continue; 
                }
                performanceScoreRaw = data.lighthouseResult?.categories?.performance?.score;
            } else {
                // Fallback to DataForSEO Lighthouse Proxy Native Array
                const authString = Buffer.from(`${dfsLogin}:${dfsPwd}`).toString('base64');
                const postData = [{ url: testUrl, for_mobile: true }];
                
                const response = await fetch('https://api.dataforseo.com/v3/on_page/lighthouse/live/json', {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(postData)
                });
                
                const data = await response.json();
                if (data.status_code !== 20000 && data.status_code !== 20100) {
                    console.warn(`[DFS PAGESPEED] Rejected:`, data.tasks?.[0]?.status_message);
                    continue;
                }
                
                // Matches the Lighthouse logic tree structure outputted natively by DFS
                performanceScoreRaw = data.tasks?.[0]?.result?.[0]?.categories?.performance?.score;
            }

            if (performanceScoreRaw !== undefined && performanceScoreRaw !== null) {
                // Lighthouse returns decimals `0.92`, we cache integers `92`
                const integerScore = Math.round(Number(performanceScoreRaw) * 100);
                
                // Mount array target back into original Schema Node
                const clusterIndex = user.seoClusters.findIndex((c: any) => String(c._id) === String(cluster._id));
                if (clusterIndex !== -1) {
                    user.seoClusters[clusterIndex].pageSpeedScore = integerScore;
                    user.seoClusters[clusterIndex].speedTrackedAt = new Date();
                    updatedCount++;
                }
            }

            // Artificial structural delay to avoid `429 Too Many Requests` Google Quota strikes
            await new Promise(resolve => setTimeout(resolve, 800));

        } catch (innerError) {
            console.warn(`[PAGESPEED EXTRAPOLATION FAIL] Exception for cluster ${cluster.keyword}:`, innerError);
            continue;
        }
    }

    if (updatedCount > 0) {
        await user.save();
    }

    return NextResponse.json({ 
        success: true, 
        message: `Lighthouse Audit Complete. Synthesized core web vitals for ${updatedCount} Semantic arrays.`,
        clusters: user.seoClusters 
    });

  } catch (error: any) {
    console.error('[PAGESPEED GRAPH TRACKING ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error executing Live PageSpeed Vitals tracking.' }, { status: 500 });
  }
}

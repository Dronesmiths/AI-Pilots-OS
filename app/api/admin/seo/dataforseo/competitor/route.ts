import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { userId, competitorUrl } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing core payload (userId required).' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible' }, { status: 404 });

    const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
    const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;

    if (!login || !pwd) {
      return NextResponse.json({ error: 'Missing DataForSEO API Credentials in user configuration or global Env.' }, { status: 400 });
    }

    const authString = Buffer.from(`${login}:${pwd}`).toString('base64');
    
    let finalCompetitorUrl = competitorUrl;

    if (!finalCompetitorUrl || finalCompetitorUrl.trim() === '') {
        // Step 1: Autonomous Competitor Discovery via Live SERP Matrix
        const autoSeed = user.seoClusters?.find((c: any) => c.category === 'service')?.keyword 
                         || user.baseServices?.[0]
                         || 'local services';
                         
        const searchPostData = [{
           keyword: autoSeed,
           location_code: 2840,
           language_code: "en",
           device: "desktop",
           os: "windows",
           depth: 15
        }];
        
        const searchRes = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
            method: 'POST',
            headers: { 'Authorization': `Basic ${authString}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(searchPostData)
        });
        const searchData = await searchRes.json();
        
        if (searchData.status_code === 20000) {
           const items = searchData.tasks?.[0]?.result?.[0]?.items || [];
           const userDomain = user.targetDomain ? user.targetDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase() : '';
           
           // Find highest ranking organic competitor omitting giant directories
           const topCompetitor = items.find((item: any) => 
               item.type === 'organic' && 
               item.domain && 
               item.domain.toLowerCase() !== userDomain && 
               !['yelp.com', 'angi.com', 'houzz.com', 'homeadvisor.com', 'thumbtack.com', 'bbb.org', 'facebook.com', 'forbes.com', 'usnews.com'].includes(item.domain.toLowerCase())
           );
           
           if (topCompetitor && topCompetitor.domain) {
               finalCompetitorUrl = topCompetitor.domain;
           } else {
               throw new Error(`DataForSEO was unable to autonomously discover a local competitor for "${autoSeed}".`);
           }
        } else {
           throw new Error(searchData.status_message || searchData.tasks?.[0]?.status_message || 'SERP Matrix search failed during Autonomous Discovery phase.');
        }
    }

    const cleanUrl = finalCompetitorUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '').trim();

    const postData = [{
      target: cleanUrl,
      location_code: 2840, // United States
      language_name: "English",
      limit: 10,
      item_types: ["organic"],
      order_by: ["keyword_data.keyword_info.search_volume,desc"]
    }];

    const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
    });

    let data;
    try {
        data = await response.json();
    } catch (e) {
        throw new Error(`DataForSEO Cloudflare 520 / Network Outage: Server is unresponsive or returning HTML.`);
    }

    if (data.status_code !== 20000) {
        throw new Error(data.status_message || data.tasks?.[0]?.status_message || 'DataForSEO API graph rejection.');
    }

    const items = data.tasks?.[0]?.result?.[0]?.items || [];
    let injectedCount = 0;

    for (const item of items) {
        const keywordData = item.keyword_data;
        if (!keywordData) continue;

        const keywordText = keywordData.keyword;
        const volume = keywordData.keyword_info?.search_volume || 0;
        const cpc = keywordData.keyword_info?.cpc || 0;
        let competitionStr = 'UNSPECIFIED';
        const compDec = keywordData.keyword_info?.competition_level;
        if (compDec === 'HIGH') competitionStr = 'HIGH';
        else if (compDec === 'MEDIUM') competitionStr = 'MEDIUM';
        else if (compDec === 'LOW') competitionStr = 'LOW';
        else if (typeof compDec === 'number') {
            if (compDec > 0.66) competitionStr = 'HIGH';
            else if (compDec > 0.33) competitionStr = 'MEDIUM';
            else competitionStr = 'LOW';
        }

        if (volume > 10) {
            const exists = user.seoClusters.some((c: any) => c.keyword.toLowerCase() === keywordText.toLowerCase());
            if (!exists) {
                user.seoClusters.push({
                    keyword: keywordText,
                    category: 'service', // Reverse-engineered inputs process as standard Semantic targets
                    status: 'idea',
                    impressions: volume,
                    cpc: Number(Number(cpc).toFixed(2)),
                    competition: competitionStr,
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
        message: `Reverse Engineering Complete. Extracted ${injectedCount} high-volume keywords from ${cleanUrl} into your Ideas staging queue.`,
        clusters: user.seoClusters 
    });

  } catch (error: any) {
    console.error('[DATAFORSEO COMPETITOR ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error executing Competitor Reverse Engineering.' }, { status: 500 });
  }
}

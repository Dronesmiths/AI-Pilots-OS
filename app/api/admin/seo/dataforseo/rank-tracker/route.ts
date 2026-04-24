import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId parameter.' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible' }, { status: 404 });

    const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
    const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;

    if (!login || !pwd) {
      return NextResponse.json({ error: 'Missing DataForSEO API Credentials in user configuration or global Env.' }, { status: 400 });
    }

    const targetDomain = user.targetDomain || user.seoEngine;
    if (!targetDomain) {
      return NextResponse.json({ error: 'No Live Target Domain configured for this user.' }, { status: 400 });
    }
    const cleanDomain = targetDomain.replace(/^https?:\/\//i, '').replace(/\/$/, '').trim();

    const authString = Buffer.from(`${login}:${pwd}`).toString('base64');
    
    const liveClusters = user.seoClusters.filter((c: any) => c.status === 'Live' || c.status === 'published');
    if (liveClusters.length === 0) {
        return NextResponse.json({ error: 'No active Live nodes to track.' }, { status: 400 });
    }

    const postData = liveClusters.map((cluster: any) => ({
      keyword: cluster.keyword || cluster.target,
      location_code: 2840, // US
      language_code: "en",
      device: "desktop",
      os: "windows",
      depth: 100
    }));

    // DataForSEO permits a max of 100 tasks per POST request. Slicing arrays to prevent graph rejection.
    const chunks = [];
    for (let i = 0; i < postData.length; i += 100) {
        chunks.push(postData.slice(i, i + 100));
    }

    let updatedCount = 0;

    for (const chunk of chunks) {
        const response = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(chunk)
        });

        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error(`DataForSEO Cloudflare 520 / Network Outage: Server is unresponsive or returning HTML.`);
        }

        if (data.status_code !== 20000) {
            console.error('DataForSEO Error:', data);
            throw new Error(data.status_message || data.tasks?.[0]?.status_message || 'DataForSEO SERP rejection.');
        }

        const tasks = data.tasks || [];
        for (const task of tasks) {
            const keyword = task.data?.keyword;
            if (!keyword) continue;

            const items = task.result?.[0]?.items || [];
            let foundRank = null;

            for (const item of items) {
                if (item.type === 'organic' && item.domain && item.domain.includes(cleanDomain)) {
                    foundRank = item.rank_absolute;
                    break;
                }
            }

            // Map structural ranking back to Semantic Node
            const clusterIndex = user.seoClusters.findIndex((c: any) => (c.keyword || c.target).toLowerCase() === keyword.toLowerCase());
            if (clusterIndex !== -1) {
                // '0' implies unranked inside Top 100
                user.seoClusters[clusterIndex].currentRank = foundRank || 0; 
                user.seoClusters[clusterIndex].rankTrackedAt = new Date();
                updatedCount++;
            }
        }
    }

    if (updatedCount > 0) {
        await user.save();
    }

    return NextResponse.json({ 
        success: true, 
        message: `Live Rank Tracking Complete. Synthesized dynamic Google SERP coordinates for ${updatedCount} deployed nodes.`,
        clusters: user.seoClusters 
    });

  } catch (error: any) {
    console.error('[DATAFORSEO RANK TRACKING ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error executing Live Rank tracking.' }, { status: 500 });
  }
}

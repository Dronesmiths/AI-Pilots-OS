import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';

export async function POST(req: Request) {
    try {
        const { userId } = await req.json();

        if (!mongoose.connection.readyState) {
            await mongoose.connect(process.env.MONGODB_URI as string);
        }

        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // 1. EXTRACT DATA FOR SEO CREDENTIALS
        const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
        const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;
        if (!login || !pwd) {
            return NextResponse.json({ error: 'Missing DataForSEO Credentials' }, { status: 400 });
        }

        // 2. PARSE SEED KEYWORDS
        let rawSeeds = user.onboardingConfig?.seedKeywords || [];
        if (typeof rawSeeds === 'string') {
            rawSeeds = rawSeeds.split(',');
        } else if (Array.isArray(rawSeeds) && rawSeeds.length === 1 && typeof rawSeeds[0] === 'string' && rawSeeds[0].includes(',')) {
            rawSeeds = rawSeeds[0].split(',');
        }
        let targetSeeds: string[] = rawSeeds.map((s: string) => s.trim()).filter(Boolean);
        if (!targetSeeds || targetSeeds.length === 0) {
            targetSeeds = ['local services'];
        }

        const authString = Buffer.from(`${login}:${pwd}`).toString('base64');
        let compCount = 0;

        try {
            const seedRaw = targetSeeds[0];
            const locRaw = user?.targetServiceAreas?.[0] || '';
            const searchPostData = [{
               keyword: locRaw ? `${seedRaw} ${locRaw}` : seedRaw,
               location_code: 2840,
               language_code: "en",
               device: "desktop",
               os: "windows",
               depth: 20
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
               const skipDomains = [
                    'yelp.com', 'angi.com', 'houzz.com', 'homeadvisor.com', 'thumbtack.com', 
                    'bbb.org', 'facebook.com', 'forbes.com', 'usnews.com', 'pinterest.com', 
                    'instagram.com', 'linkedin.com', 'wikipedia.org', 'amazon.com', 
                    'homedepot.com', 'lowes.com', 'build.com', 'wayfair.com', 'target.com', 
                    'walmart.com', 'wiktionary.org', 'merriam-webster.com', 'dictionary.com',
                    'youtube.com', 'dailymotion.com', 'vimeo.com', 'tiktok.com', 'reddit.com',
                    'quora.com', 'glassdoor.com', 'indeed.com', 'yellowpages.com', 'mapquest.com',
                    'x.com', 'twitter.com'
               ];
               
               const competitors = items.filter((item: any) => 
                   item.type === 'organic' && 
                   item.domain && 
                   item.domain.split('.').length >= 2 &&
                   !item.domain.toLowerCase().endsWith('.edu') &&
                   !item.domain.toLowerCase().endsWith('.gov') &&
                   !item.domain.toLowerCase().includes(userDomain) && 
                   !skipDomains.some(skip => item.domain.toLowerCase().includes(skip))
               );
               
               const topComps = Array.from(new Set(competitors.map((c: any) => c.domain.toLowerCase()))).slice(0, 4);
               
               for (const compDomain of topComps) {
                   const stringDomain = String(compDomain);
                   const exists = user.seoClusters.some((c: any) => c.keyword === stringDomain && c.category === 'competitor');
                   if (!exists) {
                       user.seoClusters.push({
                           keyword: stringDomain,
                           target: stringDomain,
                           category: 'competitor',
                           clusterType: 'competitor', // added for consistency
                           status: 'queued',
                           isLlmQA: false,
                           pushedAt: new Date()
                       });
                       compCount++;
                   }
               }
            }
        } catch (e) {
            console.warn('Standalone Competitor Extraction failed:', e);
            throw e;
        }

        await user.save();

        return NextResponse.json({ 
             success: true, 
             message: `Successfully extracted ${compCount} Hostile Vector domains.` 
        });

    } catch (error: any) {
        console.error('Competitor Scan Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

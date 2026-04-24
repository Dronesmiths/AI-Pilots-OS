import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import OpenAI from 'openai';

export const maxDuration = 300;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { userId, seed } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing core payload (userId required).' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible' }, { status: 404 });

    const login = user.dataForSeoLogin || process.env.DATAFORSEO_LOGIN;
    const pwd = user.dataForSeoPassword || process.env.DATAFORSEO_PASSWORD;

    if (!login || !pwd) {
      return NextResponse.json({ error: 'Missing DataForSEO API Credentials in user configuration or global Env.' }, { status: 400 });
    }

    // Extract seed keywords dynamically or fall back to CRM params
    let seedKeywords: string[] = [];
    if (seed && seed.trim().length > 0) {
        seedKeywords = seed.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    } else if (user.adsBaseServices) {
        seedKeywords = user.adsBaseServices.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    } else {
        return NextResponse.json({ error: 'Please enter a seed keyword (e.g. Roof Repair) in the search box to ignite the discovery matrix.' }, { status: 400 });
    }

    const authString = Buffer.from(`${login}:${pwd}`).toString('base64');
    
    // -------------------------------------------------------------
    // GOD MODE: OPENAI SEMANTIC EXPANSION
    // -------------------------------------------------------------
    let expandedSeeds = [...seedKeywords];
    try {
        const aiRes = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "You are an elite SEO strategist. The user gives a broad industry. You output EXACTLY 5 highly specific, highly profitable semantic sub-niches related to it. Output ONLY a flat JSON array of strings. Do not use block formatting." },
                { role: "user", content: seedKeywords[0] }
            ]
        });
        
        const rawArray = aiRes.choices[0]?.message?.content?.replace(/```json/g, '').replace(/```/g, '').trim() || "";
        const parsed = JSON.parse(rawArray);
        if (Array.isArray(parsed) && parsed.length > 0) {
            expandedSeeds = [...seedKeywords, ...parsed];
        }
    } catch (e) {
        console.warn("AI Pilots Mode AI Extension bypassed. Continuing with base seed.");
    }

    // Uniquify and Cap at 6 total targets
    expandedSeeds = Array.from(new Set(expandedSeeds.map(s => s.toLowerCase()))).slice(0, 6);

    const postData = expandedSeeds.map(seedStr => ({
      keywords: [seedStr], 
      location_code: 2840, 
      language_name: "English",
      limit: 15,
      include_serp_info: false,
      order_by: ["keyword_info.search_volume,desc"]
    }));

    const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live', {
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

    // Merge multi-threaded tasks
    let items: any[] = [];
    if (data.tasks) {
        data.tasks.forEach((task: any) => {
            if (task.result && task.result[0] && task.result[0].items) {
                items = items.concat(task.result[0].items);
            }
        });
    }
    const formattedIdeas = items.map((item: any) => ({
        keyword: item.keyword,
        search_volume: item.keyword_info?.search_volume || 0,
        cpc: item.keyword_info?.cpc || 0,
        competition: item.keyword_info?.competition_level || 'UNKNOWN'
    })).filter((idea: any) => idea.search_volume > 10);

    return NextResponse.json({ 
        success: true, 
        ideas: formattedIdeas 
    });

  } catch (error: any) {
    console.error('[DATAFORSEO NICHE DISCOVERY ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error executing Organic Niche Discovery.' }, { status: 500 });
  }
}

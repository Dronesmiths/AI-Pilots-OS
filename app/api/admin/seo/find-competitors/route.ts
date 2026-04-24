import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { userId, niche, location } = await req.json();

    if (!userId || !niche || !location) {
      return NextResponse.json({ error: 'Missing Required Context (Niche or Location)' }, { status: 400 });
    }

    if (!mongoose.connections[0].readyState) {
      await mongoose.connect(process.env.MONGODB_URI as string);
    }

    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    console.log(`[COMPETITOR INTEL] Using Gemini to globally search top rivals for: ${niche} in ${location}...`);

    const model = genAI.getGenerativeModel({ model: 'gemini-3.1-pro-preview' });
    
    const prompt = `You are an elite Local SEO Strategist possessing deep knowledge of real-world local businesses.
    Your objective is to identify the top 5 REAL, active corporate competitors for a specific business niche in a specific location.
    
    Target Industry/Niche: ${niche}
    Target Geographic Location: ${location}
    
    Identify the 5 strongest competitors currently dominating Google organic search in that exact area for that exact niche.
    Ignore massive directories like Yelp, Angi, HomeAdvisor, Houzz, Thumbtack, or Forbes. I need the actual local businesses.
    
    Extract ONLY their root domain names (e.g., remodelutah.com, beehiveplumbing.com).
    
    Return the payload STRICTLY as a raw JSON API response matching this exact array schema format:
    [
       "competitor1.com",
       "competitor2.com",
       "competitor3.com"
    ]
    
    DO NOT wrap the JSON in markdown blocks like \`\`\`json. Return only the raw flat string array structure.
    `;

    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    
    if (responseText.startsWith('\`\`\`json')) {
       responseText = responseText.replace(/^\`\`\`json/i, '').replace(/\`\`\`$/i, '').trim();
    }
    
    let competitors: string[] = [];
    try {
       competitors = JSON.parse(responseText);
    } catch (e) {
       console.error("Gemini competitor parse failed. Raw Output:", responseText);
       return NextResponse.json({ error: 'AI failed to synthesize local SERP data into valid JSON schema.' }, { status: 500 });
    }

    if (!Array.isArray(competitors) || competitors.length === 0) {
       return NextResponse.json({ error: 'AI returned empty or invalid intelligence array.' }, { status: 500 });
    }

    // Clean domains (strip https:// and www.)
    competitors = competitors.map(c => c.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''));

    console.log(`[COMPETITOR INTEL] Found localized targets:`, competitors);

    return NextResponse.json({ 
       success: true, 
       competitors 
    });

  } catch (error: any) {
    console.error('Find Competitors API Error:', error);
    return NextResponse.json({ error: error.message || 'Internal pipeline failure' }, { status: 500 });
  }
}

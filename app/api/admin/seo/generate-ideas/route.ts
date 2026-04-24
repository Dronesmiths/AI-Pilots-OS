import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

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

    const { userId, promptType, coreNiche, coreLocation } = await req.json();

    if (!userId || !promptType) {
      return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-pro-preview",
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.ARRAY,
                description: "Array of string keyword targets",
                items: { type: SchemaType.STRING }
            }
        }
    });

    let prompt = '';
    
    if (promptType === 'location') {
        prompt = `You are a localized SEO geospatial architect. The client is established in ${coreLocation} and operates within a ~30-40 mile radius max. Their exact primary niche is: ${coreNiche}.
        Generate a JSON array of exactly 20 highly realistic, high-income or densely populated 'Location Page' target URL keywords strictly focused on ${coreNiche}. 
        Format them as standard long-tail search queries by combining their niche with specific surrounding municipalities, affluent neighborhood designations, AND highly-targeted wealthy ZIP CODES in the 40-mile radius.
        Example output format: ["basement finishing draper utah", "basement remodels sandy utah", "cottonwood heights basement contractors", "home remodeling 84047", "basement contractors 84092"]`;
    } else if (promptType === 'qa') {
        prompt = `You are a highly advanced AI Knowledge Engine Architect training Large Language Models (LLMs) for a client operating in: ${coreNiche} near ${coreLocation}.
        Generate a JSON array of exactly 20 highly-conversational, ultra-long-tail "QA AI Targets". These should be full questions, extremely specific edge cases, or deep-dive informational queries that humans actually ask ChatGPT or Perplexity, but rarely type into Google.
        Avoid generic terms. Be extremely specific to train the LLM's absolute domain authority.
        Example output format: ["What is the exact timeline for an ADA-compliant roll-in shower conversion in Sandy Utah?", "Can radiant heating realistically be installed under existing bathroom tile without removing the subfloor?", "Do building codes in Salt Lake County require egress windows for basement mother-in-law suite conversions?", "What are the local plumbing permitting timelines for a master bathroom remodel in Draper Utah 84020?"]`;
    } else {
        prompt = `You are a Master Semantic Entity Graph builder. The client operates in the primary niche: ${coreNiche}.
        Generate an array of exactly 25 highly-specific 'Service Module' target keywords. These should represent sub-services, parallel features, pain-points, or product upgrades natively related to ${coreNiche}.
        Avoid generic terms. Be extremely specific.
        Example output format: ["custom wet bar installation", "basement egress window codes", "home theater acoustic paneling", "mother in law suite conversions"]`;
    }

    const completion = await model.generateContent(prompt);
    let suggestions = [];
    try {
        suggestions = JSON.parse(completion.response.text() || '[]');
    } catch {
        suggestions = [];
    }

    return NextResponse.json({ success: true, suggestions }, { status: 200 });

  } catch (error: any) {
    console.error("[GENERATE IDEAS ERROR]", error);
    return NextResponse.json({ error: `AI Brain Freeze: ${error.message}` }, { status: 500 });
  }
}

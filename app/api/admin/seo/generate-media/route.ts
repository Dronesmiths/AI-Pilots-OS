/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import Replicate from 'replicate';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');

    const { userId, clusterId, keyword } = await request.json();
    if (!userId || !clusterId || !keyword) return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });

    if (!process.env.REPLICATE_API_TOKEN) {
        return NextResponse.json({ error: 'Replicate API token is missing in .env.local.' }, { status: 500 });
    }

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Asset Optimization Pooling: Extract all existing generated node images globally to construct a reusable web.
    const existingPool: { url: string, alt: string }[] = [];
    (user.seoClusters || []).forEach((c: any) => {
       if (c.heroImage && c.heroImage.startsWith('http')) existingPool.push({ url: c.heroImage, alt: c.heroAlt || keyword });
       if (c.midImage && c.midImage.startsWith('http')) existingPool.push({ url: c.midImage, alt: c.midAlt || keyword });
    });

    // Execute 40% recycling probability thresholds if the asset library is dense enough (>15 images)
    const GLOBAL_POOL_TRIGGER = 15;
    const RECYCLE_PROBABILITY = 0.40; // 40% chance of cross-linking an existing image asset
    
    let heroImage = "";
    let midImage = "";
    let heroAlt = "";
    let midAlt = "";

    const shouldUsePool = () => existingPool.length >= GLOBAL_POOL_TRIGGER && Math.random() < RECYCLE_PROBABILITY;

    if (shouldUsePool()) {
       console.log(`[Asset Library] Recycling Hero Image natively from internal pool.`);
       const randomHero = existingPool[Math.floor(Math.random() * existingPool.length)];
       heroImage = randomHero.url;
       heroAlt = randomHero.alt;
    }

    if (shouldUsePool()) {
       console.log(`[Asset Library] Recycling Mid-Page Image natively from internal pool.`);
       const randomMid = existingPool[Math.floor(Math.random() * existingPool.length)];
       midImage = randomMid.url;
       midAlt = randomMid.alt;
    }

    // Generate specific images from scratch ONLY if they weren't matched dynamically in the recycling pool.
    if (!heroImage) {
        console.log(`[Replicate] Generating fresh Hero Image for semantic keyword: ${keyword}`);
        const heroOutput = await replicate.run("black-forest-labs/flux-schnell", {
          input: {
            prompt: `A highly professional, ultra-realistic 8k web header hero image representing the business service concept: "${keyword}". Rich colors, modern corporate photography style. ABSOLUTELY NO TEXT, NO TYPOGRAPHY, NO LETTERS, NO WORDS, NO WATERMARKS, completely clean unbranded photo.`,
            aspect_ratio: "16:9",
            output_format: "webp"
          }
        });
        heroImage = Array.isArray(heroOutput) ? heroOutput[0] : heroOutput;
    }

    if (!midImage) {
        console.log(`[Replicate] Generating fresh Mid-Page Image for semantic keyword: ${keyword}`);
        const midOutput = await replicate.run("black-forest-labs/flux-schnell", {
          input: {
            prompt: `A photorealistic editorial marketing photo representing the business service: "${keyword}". Modern architectural lighting, crisp focus. ABSOLUTELY NO TEXT, NO TYPOGRAPHY, NO LETTERS, NO WORDS, NO WATERMARKS, completely clean unbranded photo.`,
            aspect_ratio: "3:2",
            output_format: "webp"
          }
        });
        midImage = Array.isArray(midOutput) ? midOutput[0] : midOutput;
    }

    // Only hit Google Vision for OCR SEO mapping strictly if it's a freshly generated image without an existing Alt context
    if (!heroAlt || !midAlt) {
        console.log(`[Vision] Reading Replicate WebP Buffers for Gemini OCR Engine...`);
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const generateAlt = async (url: string, imgType: string) => {
            try {
                const bufRes = await fetch(url);
                const arrayBuffer = await bufRes.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString('base64');
                
                const prompt = `You are an elite SEO Engineer. Analyze this AI-generated ${imgType} photo created for the keyword: "${keyword}". Write a highly descriptive, extremely concise SEO 'alt' tag describing exactly what is in this photo to rank on Google Images. Do NOT use quotes. Output ONLY the raw alt text string.`;
                
                const result = await visionModel.generateContent([
                    prompt,
                    { inlineData: { data: base64Data, mimeType: "image/webp" } }
                ]);
                return result.response.text().trim().replace(/"/g, '') || keyword;
            } catch(e) {
                console.error("Vision API Error:", e);
                return keyword;
            }
        };

        if (!heroAlt) heroAlt = await generateAlt(heroImage, 'hero');
        if (!midAlt) midAlt = await generateAlt(midImage, 'mid-page editorial');
    }
    
    // Inject the generated delivery URLs deep into the specific BSON cluster node
    await User.updateOne(
      { _id: userId, "seoClusters._id": clusterId },
      { 
        $set: { 
          "seoClusters.$.heroImage": heroImage,
          "seoClusters.$.midImage": midImage,
          "seoClusters.$.heroAlt": heroAlt,
          "seoClusters.$.midAlt": midAlt
        } 
      }
    );

    return NextResponse.json({ success: true, heroImage, midImage, heroAlt, midAlt }, { status: 200 });

  } catch (error: any) {
    console.error("Replicate AI Vision Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

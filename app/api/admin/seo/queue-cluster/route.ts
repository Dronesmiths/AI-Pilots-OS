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

    const { userId, clusterId, finalHtml } = await req.json();
    if (!userId || !clusterId || !finalHtml) {
      return NextResponse.json({ error: 'Missing parameters.' }, { status: 400 });
    }

    await connectToDatabase();
    
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    
    // Mongoose array iteration
    const cluster = user.seoClusters.id(clusterId);
    if (!cluster) return NextResponse.json({ error: 'Cluster not found.' }, { status: 404 });

    // 1. Generate JSON-LD Schema based exactly on the final drafted HTML using Gemini Pro
    const metaModel = genAI.getGenerativeModel({ 
        model: "gemini-1.5-pro",
        generationConfig: {
            responseMimeType: "application/json"
        }
    });
    
    const prompt = `You are an elite Technical SEO Engineer. 
    Your explicit job is to analyze the provided landing page HTML and output a STRICT, beautifully formatted JSON-LD Schema.org block. 
    Focus on combining 'Service' or 'Product' schemas with an integrated 'FAQPage' schema extracted strictly from the content's context. 
    Do not include <script> tags, output pure JSON object.
    
    Keyword: ${cluster.keyword}. 
    HTML Context: ${finalHtml.substring(0, 1500)}...`;

    const completion = await metaModel.generateContent(prompt);
    const faqSchemaJSON = completion.response.text() || '{}';

    // 2. Calculate Pacing Timer
    const queuedCount = user.seoClusters.filter(c => c.githubSyncRequired && !c.pushedAt && c._id.toString() !== clusterId).length;
    const dailyLimit = Math.max(1, user.dailyPageProductionLimit || 2);
    const delayHours = (24 / dailyLimit) * queuedCount;

    // 3. Update cluster array natively - Bypassing 04-content-drone entirely!
    cluster.htmlContent = finalHtml; // Save the writer's final perfect HTML
    cluster.faqSchema = faqSchemaJSON;
    cluster.status = 'templated'; // Ready for 32-github-sync-drone
    cluster.githubSyncRequired = true;
    cluster.scheduledTime = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();

    await user.save();

    return NextResponse.json({ success: true, message: 'Cluster securely locked into Queue.' }, { status: 200 });
    
  } catch (error: any) {
    console.error("[QUEUE CLUSTER ERROR]", error);
    return NextResponse.json({ error: `Queue crash: ${error.message}` }, { status: 500 });
  }
}

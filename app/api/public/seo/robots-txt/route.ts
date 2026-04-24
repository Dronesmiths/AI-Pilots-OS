import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) return new NextResponse('Missing userId parameter', { status: 400 });

        if (!mongoose.connections[0].readyState) {
            await mongoose.connect(process.env.MONGODB_URI as string);
        }

        const user = await User.findById(userId).lean();
        if (!user) return new NextResponse('User not found', { status: 404 });

        const liveDomain = (user.targetDomain || user.seoEngine || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
        const baseUrl = liveDomain ? `https://${liveDomain}` : 'https://YOUR_DOMAIN.com';

        const robotsTxt = `User-agent: *
Allow: /

# ---------------------------------------------
# Explicit permissions for AI Agents & LLM Crawlers
# ---------------------------------------------
User-agent: GPTBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: Google-Extended
Allow: /
User-agent: anthropic-ai
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /

# ---------------------------------------------
# Core Semantic Maps
# ---------------------------------------------
Sitemap: ${baseUrl}/sitemap_index.xml
`;

        return new NextResponse(robotsTxt, {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
        });

    } catch (e: any) {
        return new NextResponse(`Internal Robots.txt Generation Error: ${e.message}`, { status: 500 });
    }
}
